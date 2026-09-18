'use client';

// src/components/TimingBadge.tsx
// Market-timing icon for a futures row: buy before a soft stretch, sell or
// wait before a hard one. Hover for the numbers. Shared by the Futures and
// G5 Playoff panels.

export interface TimingView {
  window: number;
  games: { opponent: string; home: boolean; neutral: boolean; pWin: number; date: string }[];
  pSweep: number;
  pNow: number;
  pIfSweep: number;
  pIfNotSweep: number;
  lift: number;
  drop: number;
  signal: 'strong-buy' | 'buy' | 'sell' | 'hold' | 'none';
}

const pct = (p: number, dp = 0) => `${(p * 100).toFixed(dp)}%`;

export function timingText(t: TimingView, outcome: string): string {
  const slate = t.games.map((g) => `${g.neutral ? 'vs' : g.home ? 'vs' : '@'} ${g.opponent} ${pct(g.pWin)}`).join(', ');
  const head = {
    'strong-buy': 'BUY NOW',
    buy: 'Buy window',
    sell: 'Sell / wait',
    hold: 'Priced in',
    none: 'No timing edge',
  }[t.signal];
  return `${head} · next ${t.window}: ${slate}. Sweep ${pct(t.pSweep)}. ${outcome} ${pct(t.pNow, 1)} → ${pct(t.pIfSweep, 1)} if swept, ${pct(t.pIfNotSweep, 1)} if not.`;
}

export default function TimingBadge({ timing, outcome = 'Odds' }: { timing: TimingView | null | undefined; outcome?: string }) {
  if (!timing || timing.signal === 'none') return null;
  const cls = {
    'strong-buy': 'bg-emerald-600 text-white',
    buy: 'bg-emerald-100 text-emerald-800',
    sell: 'bg-red-100 text-red-700',
    hold: 'bg-slate-100 text-slate-500',
    none: '',
  }[timing.signal];
  const glyph = timing.signal === 'strong-buy' ? '▲▲' : timing.signal === 'buy' ? '▲' : timing.signal === 'sell' ? '▼' : '=';
  const label =
    timing.signal === 'strong-buy' || timing.signal === 'buy'
      ? `${pct(timing.pNow)}→${pct(timing.pIfSweep)}`
      : timing.signal === 'sell'
        ? `${pct(timing.pNow)}→${pct(timing.pIfNotSweep)}`
        : 'priced';
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold tabular-nums whitespace-nowrap ${cls}`}
      title={timingText(timing, outcome)}
    >
      <span>{glyph}</span>
      <span>{label}</span>
    </span>
  );
}
