// src/lib/props/kalshiProps.ts
// Shared client helpers for Kalshi player-prop ladders (served by
// /api/kalshi-props). Kalshi structures props as per-player Yes/No threshold
// markets rather than one juiced O/U line: Over = buy Yes at the ask,
// Under = buy No at (1 − yes bid).

export interface KalshiRung {
  player: string;        // parsed from the market title ("Drew Lock: 50+ …")
  strike: number;        // floor_strike, e.g. 49.5 → the 50+ rung
  yesBid: number | null; // dollars (0-1); null = no resting bid
  yesAsk: number | null; // dollars (0-1); null = no resting ask
  ticker: string;
  eventTitle: string;
}

// Kalshi charges 7%·p·(1−p) per contract; quote fee-INCLUSIVE American odds so
// rung prices compare apples-to-apples with book prices (same convention as
// the game-lines integration in src/lib/kalshi.ts — conservative rounding).
export const KALSHI_FEE = 0.07;

export const kalshiCostToAmerican = (priceDollars: number): number | null => {
  const c = priceDollars + KALSHI_FEE * priceDollars * (1 - priceDollars);
  if (c <= 0 || c >= 1) return null;
  return c <= 0.5 ? Math.floor((1 / c - 1) * 100) : -Math.ceil((c / (1 - c)) * 100);
};

export async function fetchKalshiRungs(marketKey: string): Promise<KalshiRung[]> {
  try {
    const r = await fetch(`/api/kalshi-props?market=${marketKey}`);
    if (!r.ok) return [];
    return (await r.json()).rungs ?? [];
  } catch {
    return [];
  }
}
