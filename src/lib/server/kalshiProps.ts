// src/lib/server/kalshiProps.ts
//
// Kalshi player props for one game, shaped like a bookmaker in the Odds API
// event-odds response so the Props view can read it beside the other books.
//
// Kalshi has no single O/U line per player: each prop is a ladder of Yes/No
// threshold markets ("Christian Watson: 60+ receiving yards", floor_strike
// 59.5). Every open rung goes out as an Over (buy Yes at the ask) and an
// Under (buy No at its ask) at that strike; the client picks the rung nearest
// the sportsbooks' line. Prices include Kalshi's fee, as on the game lines.
// Kalshi's API is public and free: none of this touches the Odds API credits.

import { kalshiCostToAmerican } from '@/lib/props/kalshiProps';

const KALSHI_BASE = 'https://api.elections.kalshi.com/trade-api/v2';

// Odds API prop market → Kalshi series, per sport. NFL only so far.
const SERIES: Record<string, Record<string, string>> = {
  americanfootball_nfl: {
    player_pass_yds: 'KXNFLPASSYDS',
    player_pass_attempts: 'KXNFLPASSATT',
    player_pass_completions: 'KXNFLPASSCOMP',
    player_pass_tds: 'KXNFLPASSTDS',
    player_rush_yds: 'KXNFLRSHYDS',
    player_rush_attempts: 'KXNFLRSHATT',
    player_reception_yds: 'KXNFLRECYDS',
    player_receptions: 'KXNFLREC',
    player_anytime_td: 'KXNFLTD',
  },
};
// The series whose event list finds the game (every series shares the suffix)
const LOOKUP_MARKET = 'player_reception_yds';
// Yes/No markets: only the first rung ("1+") is the prop; the rest are alternates
const YES_NO_MARKETS = new Set(['player_anytime_td']);

interface KalshiMarket {
  ticker?: string;
  title?: string;
  status?: string;
  floor_strike?: number;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  no_ask_dollars?: string;
}

export interface KalshiPropOutcome {
  name: 'Over' | 'Under' | 'Yes' | 'No';
  description: string; // player
  price: number;
  point?: number;
  link: string;
}

export interface KalshiPropsBookmaker {
  key: 'kalshi';
  title: 'Kalshi';
  last_update: string;
  markets: { key: string; last_update: string; outcomes: KalshiPropOutcome[] }[];
}

const price = (raw: string | undefined): number | null => {
  const p = parseFloat(raw ?? '');
  return !isNaN(p) && p > 0 && p < 1 ? p : null;
};

async function getJson(url: string, revalidate: number): Promise<Record<string, unknown> | null> {
  try {
    const resp = await fetch(url, { next: { revalidate }, signal: AbortSignal.timeout(6000) });
    return resp.ok ? await resp.json() : null;
  } catch {
    return null;
  }
}

/**
 * The shared event suffix for a game ("26OCT11CHIGB"), found in one series'
 * open events. Kalshi titles a game "Chicago vs Green Bay: Receiving Yards"
 * with cities only ("New York J", "Los Angeles R"), so each side must begin
 * one of the two team names.
 */
async function eventSuffix(sport: string, away: string, home: string): Promise<string | null> {
  const series = SERIES[sport]?.[LOOKUP_MARKET];
  if (!series) return null;
  const data = await getJson(`${KALSHI_BASE}/events?series_ticker=${series}&status=open&limit=200`, 300);
  const events = (data?.events ?? []) as { event_ticker?: string; title?: string }[];
  const teams = [away.toLowerCase(), home.toLowerCase()];
  for (const ev of events) {
    const sides = (ev.title ?? '').split(':')[0].split(/\s+vs\.?\s+/i).map((s) => s.trim().toLowerCase());
    if (sides.length !== 2 || !ev.event_ticker) continue;
    const match = (a: number, b: number) => teams[0].startsWith(sides[a]) && teams[1].startsWith(sides[b]);
    if (match(0, 1) || match(1, 0)) return ev.event_ticker.slice(series.length + 1);
  }
  return null;
}

export async function fetchKalshiPropsBookmaker(sport: string, away: string, home: string): Promise<KalshiPropsBookmaker | null> {
  const seriesByMarket = SERIES[sport];
  if (!seriesByMarket) return null;
  const suffix = await eventSuffix(sport, away, home);
  if (!suffix) return null;

  const now = new Date().toISOString();
  const markets = await Promise.all(
    Object.entries(seriesByMarket).map(async ([marketKey, series]) => {
      const eventTicker = `${series}-${suffix}`;
      const data = await getJson(`${KALSHI_BASE}/markets?event_ticker=${eventTicker}&status=open&limit=1000`, 60);
      const outcomes: KalshiPropOutcome[] = [];
      for (const m of (data?.markets ?? []) as KalshiMarket[]) {
        if (m.status && m.status !== 'active') continue;
        const player = m.title?.split(':')[0]?.trim();
        if (!player || typeof m.floor_strike !== 'number' || !m.ticker) continue;
        const yesNo = YES_NO_MARKETS.has(marketKey);
        if (yesNo && m.floor_strike !== 0.5) continue;
        // Buy Yes at the ask; buy No at its ask (= 1 − the Yes bid)
        const yesAsk = price(m.yes_ask_dollars);
        const yesBid = price(m.yes_bid_dollars);
        const noAsk = price(m.no_ask_dollars) ?? (yesBid !== null ? 1 - yesBid : null);
        const link = `https://kalshi.com/markets/${eventTicker}?op_market_ticker=${m.ticker}`;
        const add = (name: KalshiPropOutcome['name'], cost: number | null) => {
          const american = cost !== null ? kalshiCostToAmerican(cost) : null;
          if (american === null) return;
          outcomes.push({ name, description: player, price: american, ...(yesNo ? {} : { point: m.floor_strike }), link });
        };
        add(yesNo ? 'Yes' : 'Over', yesAsk);
        add(yesNo ? 'No' : 'Under', noAsk);
      }
      return { key: marketKey, last_update: now, outcomes };
    })
  );

  const priced = markets.filter((m) => m.outcomes.length > 0);
  return priced.length > 0 ? { key: 'kalshi', title: 'Kalshi', last_update: now, markets: priced } : null;
}
