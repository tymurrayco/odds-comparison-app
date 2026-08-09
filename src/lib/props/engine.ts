// src/lib/props/engine.ts
// Prop pricing math: distributions, odds conversions, devigging, EV, ladders.
// Pure functions — no I/O. Tested by scripts/props.test.ts.

import { Distribution } from './markets';

// ---------- basic stats ----------

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

export function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Sample standard deviation (n − 1). */
export function stdDev(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  const ss = xs.reduce((a, x) => a + (x - m) * (x - m), 0);
  return Math.sqrt(ss / (xs.length - 1));
}

// ---------- distributions ----------

/** Standard normal CDF via Abramowitz–Stegun erf approximation (|err| < 1.5e-7). */
export function normCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p =
    d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

/**
 * Lognormal parameters matching a target mean m and SD s:
 *   sigma² = ln(1 + (s/m)²),  mu = ln(m) − sigma²/2
 * Median = exp(mu) = m / sqrt(1 + (s/m)²) — always below the mean (right skew).
 */
export function lognormalParams(m: number, s: number): { mu: number; sigma: number; median: number } {
  const v = Math.log(1 + (s * s) / (m * m));
  const sigma = Math.sqrt(v);
  const mu = Math.log(m) - v / 2;
  return { mu, sigma, median: Math.exp(mu) };
}

/** P(X > line) for the given distribution with mean m and SD s. */
export function probOver(m: number, s: number, line: number, dist: Distribution): number {
  if (!(m > 0) || !(s > 0)) return NaN;
  if (dist === 'normal') return 1 - normCdf((line - m) / s);
  if (line <= 0) return 1;
  const { mu, sigma } = lognormalParams(m, s);
  return 1 - normCdf((Math.log(line) - mu) / sigma);
}

// ---------- odds conversions ----------

/** American odds → implied probability (vig included). */
export function americanToProb(odds: number): number {
  return odds < 0 ? -odds / (-odds + 100) : 100 / (odds + 100);
}

/** American odds → decimal odds. */
export function americanToDecimal(odds: number): number {
  return odds < 0 ? 1 + 100 / -odds : 1 + odds / 100;
}

/** Probability → fair American odds (rounded to integer). */
export function probToAmerican(p: number): number {
  if (!(p > 0) || !(p < 1)) return NaN;
  return p >= 0.5 ? -Math.round((p / (1 - p)) * 100) : Math.round(((1 - p) / p) * 100);
}

/**
 * Proportional devig of a two-sided market. Returns each side's fair
 * probability plus the overround (e.g. 0.05 = 5% total charge).
 */
export function devig(overOdds: number, underOdds: number): { pOver: number; pUnder: number; overround: number } {
  const iOver = americanToProb(overOdds);
  const iUnder = americanToProb(underOdds);
  const total = iOver + iUnder;
  return { pOver: iOver / total, pUnder: iUnder / total, overround: total - 1 };
}

/** Break-even win probability at a price. */
export function breakeven(odds: number): number {
  return americanToProb(odds);
}

/** Expected return per $1 staked given win probability p and a price. */
export function expectedValue(p: number, odds: number): number {
  const payout = americanToDecimal(odds) - 1;
  return p * payout - (1 - p);
}

// ---------- ladder ----------

export interface LadderRung {
  line: number;
  pOver: number;
  fairOver: number;   // fair American price for the over
  pUnder: number;
  fairUnder: number;
  overOdds: number | null;  // book price if available
  underOdds: number | null;
  overEv: number | null;    // EV per $1 at the book price
  underEv: number | null;
}

/**
 * Price a ladder of lines from one distribution. bookPrices maps line →
 * {over, under} American odds where available.
 */
export function priceLadder(
  m: number,
  s: number,
  dist: Distribution,
  lines: number[],
  bookPrices?: Map<number, { over: number | null; under: number | null }>
): LadderRung[] {
  return lines.map((line) => {
    const pOver = probOver(m, s, line, dist);
    const pUnder = 1 - pOver;
    const book = bookPrices?.get(line);
    const overOdds = book?.over ?? null;
    const underOdds = book?.under ?? null;
    return {
      line,
      pOver,
      fairOver: probToAmerican(pOver),
      pUnder,
      fairUnder: probToAmerican(pUnder),
      overOdds,
      underOdds,
      overEv: overOdds !== null ? expectedValue(pOver, overOdds) : null,
      underEv: underOdds !== null ? expectedValue(pUnder, underOdds) : null,
    };
  });
}

/** Synthetic ladder lines centered near the projection: mean ± 3 steps. */
export function syntheticLines(m: number, step: number): number[] {
  const center = Math.round(m / step) * step;
  const lines: number[] = [];
  for (let i = -3; i <= 3; i++) {
    const l = center + i * step - 0.5;
    if (l > 0) lines.push(l);
  }
  return lines;
}
