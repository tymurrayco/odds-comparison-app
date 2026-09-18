// src/lib/fbs/timing.ts

/**
 * Market timing: books move futures prices on results, not on the schedule
 * ahead. A team about to play a soft stretch will likely be shorter in a
 * few weeks with nothing about the team having changed — buy before it.
 * A hard stretch is the mirror — wait, or sell.
 *
 * Both sims (conference futures, G5 playoff) count, per team, the runs in
 * which it swept its next `window` games and what its outcome probability
 * was in those runs versus the rest. This module turns those counts into a
 * signal. Note E[after] = pSweep·pIfSweep + (1−pSweep)·pIfNotSweep = pNow,
 * so the lift itself is the trade and pSweep is the confidence.
 */

export interface TimingGame {
  opponent: string;
  home: boolean;
  neutral: boolean;
  pWin: number;
  date: string;
}

export type TimingSignal = 'strong-buy' | 'buy' | 'sell' | 'hold' | 'none';

export interface Timing {
  window: number;
  games: TimingGame[];
  pSweep: number;        // wins every game in the window
  pNow: number;          // outcome probability today
  pIfSweep: number;      // outcome probability in the runs where it swept
  pIfNotSweep: number;   // … where it dropped at least one
  lift: number;          // pIfSweep − pNow (what a sweep is worth)
  drop: number;          // pNow − pIfNotSweep (what a slip costs)
  signal: TimingSignal;
}

export const DEFAULT_TIMING_WINDOW = 3;
export const TIMING_WINDOWS = [2, 3, 4];

const r4 = (x: number) => Math.round(x * 10000) / 10000;

/**
 * Thresholds (probability points): a buy needs the sweep to be likely AND
 * worth something; a sell needs a slip to be likely AND costly. Tiny
 * outcome probabilities are ignored — a 1% → 2% move is noise.
 */
export function classifyTiming(pSweep: number, pNow: number, pIfSweep: number, pIfNotSweep: number): TimingSignal {
  const lift = pIfSweep - pNow;
  const drop = pNow - pIfNotSweep;
  if (pNow < 0.02 && pIfSweep < 0.05) return 'none';
  if (pSweep >= 0.75 && lift >= 0.10) return 'strong-buy';
  if (pSweep >= 0.60 && lift >= 0.05) return 'buy';
  if (pSweep <= 0.50 && drop >= 0.05 && pNow >= 0.05) return 'sell';
  if (pSweep >= 0.60 && lift < 0.05) return 'hold';
  return 'none';
}

export function makeTiming(
  window: number,
  games: TimingGame[],
  sweeps: number,
  outcomeIfSweep: number,
  outcomeIfNotSweep: number,
  sims: number,
  pNow: number
): Timing | null {
  if (games.length < window) return null; // season nearly over — no stretch to time
  const pSweep = sweeps / sims;
  const pIfSweep = sweeps > 0 ? outcomeIfSweep / sweeps : 0;
  const rest = sims - sweeps;
  const pIfNotSweep = rest > 0 ? outcomeIfNotSweep / rest : 0;
  return {
    window,
    games,
    pSweep: r4(pSweep),
    pNow: r4(pNow),
    pIfSweep: r4(pIfSweep),
    pIfNotSweep: r4(pIfNotSweep),
    lift: r4(pIfSweep - pNow),
    drop: r4(pNow - pIfNotSweep),
    signal: classifyTiming(pSweep, pNow, pIfSweep, pIfNotSweep),
  };
}

export function clampWindow(raw: unknown): number {
  const n = Number(raw);
  return TIMING_WINDOWS.includes(n) ? n : DEFAULT_TIMING_WINDOW;
}
