// src/app/api/kalshi-props/route.ts
// Kalshi NFL player-prop ladders for the Prop Table. Kalshi structures props
// as per-player Yes/No threshold markets ("Drew Lock: 50+ passing yards" at
// floor_strike 49.5) rather than one juiced O/U line, so we return every open
// rung and let the client price each one against the model. Public endpoint —
// no API key, and none of this touches the Odds API credit budget.

import { NextResponse } from 'next/server';

// Our prop market keys (src/lib/props/markets.ts) → Kalshi series tickers.
// Targets has no Kalshi series.
const SERIES_MAP: Record<string, string> = {
  pass_yds: 'KXNFLPASSYDS',
  pass_attempts: 'KXNFLPASSATT',
  pass_completions: 'KXNFLPASSCOMP',
  rush_yds: 'KXNFLRSHYDS',
  rush_attempts: 'KXNFLRSHATT',
  rec_yds: 'KXNFLRECYDS',
  receptions: 'KXNFLREC',
};

const KALSHI_BASE = 'https://api.elections.kalshi.com/trade-api/v2';

interface KalshiNestedMarket {
  ticker?: string;
  title?: string;
  floor_strike?: number;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  status?: string;
}

interface KalshiEvent {
  event_ticker?: string;
  title?: string;
  markets?: KalshiNestedMarket[];
}

export interface KalshiPropRung {
  player: string;       // parsed from the market title ("Drew Lock: 50+ …")
  strike: number;       // floor_strike, e.g. 49.5 → the 50+ rung
  yesBid: number | null; // dollars (0-1); null = no resting bid
  yesAsk: number | null; // dollars (0-1); null = no resting ask
  ticker: string;
  eventTicker: string;
  eventTitle: string;
}

const parsePrice = (raw: string | undefined): number | null => {
  const p = parseFloat(raw ?? '');
  return !isNaN(p) && p > 0 && p < 1 ? p : null;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const market = searchParams.get('market') ?? '';
  const series = SERIES_MAP[market];
  if (!series) {
    return NextResponse.json({ rungs: [], unsupported: true });
  }

  const rungs: KalshiPropRung[] = [];
  try {
    let cursor = '';
    // Cursor pagination; the page cap is a runaway guard, one page is typical.
    for (let page = 0; page < 5; page++) {
      const qs = `series_ticker=${series}&status=open&with_nested_markets=true&limit=200${cursor ? `&cursor=${cursor}` : ''}`;
      const resp = await fetch(`${KALSHI_BASE}/events?${qs}`, { next: { revalidate: 60 } });
      if (!resp.ok) break;
      const data = await resp.json();
      const events: KalshiEvent[] = data?.events ?? [];
      for (const ev of events) {
        for (const m of ev.markets ?? []) {
          if (m.status && m.status !== 'active') continue;
          const player = m.title?.split(':')[0]?.trim();
          if (!player || typeof m.floor_strike !== 'number' || !m.ticker) continue;
          const yesBid = parsePrice(m.yes_bid_dollars);
          const yesAsk = parsePrice(m.yes_ask_dollars);
          if (yesBid === null && yesAsk === null) continue; // empty book — nothing to bet
          rungs.push({
            player,
            strike: m.floor_strike,
            yesBid,
            yesAsk,
            ticker: m.ticker,
            eventTicker: ev.event_ticker ?? '',
            eventTitle: ev.title ?? '',
          });
        }
      }
      cursor = data?.cursor ?? '';
      if (!cursor || events.length === 0) break;
    }
    return NextResponse.json({ rungs });
  } catch (error) {
    console.error('kalshi-props error:', error);
    return NextResponse.json({ rungs: [], error: 'Kalshi fetch failed' }, { status: 502 });
  }
}
