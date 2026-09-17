// src/lib/novig.ts
// Direct Novig feed. Novig's web app reads an anonymous Hasura GraphQL API;
// The Odds API relays Novig too, but since 2026-09-16 its relay drops the
// current NFL week for hours at a time, so the board reads Novig itself
// (Tyler has Novig's approval to display their prices, 2026-09-17).
//
// Shapes: event(type "Game") → game { homeTeam, awayTeam } + markets of type
// MONEY / SPREAD / TOTAL, one market per strike (line). outcome.available is
// the price in dollars per $1 payout (0.53 → −113). The "main" spread/total is
// the strike with the most volume; with no volume yet, the most balanced one.

export const NOVIG_GRAPHQL_URL = 'https://api.novig.us/v1/graphql';

export const SPORT_TO_NOVIG_LEAGUE: Record<string, string> = {
  americanfootball_nfl: 'NFL',
  americanfootball_ncaaf: 'NCAAF',
  baseball_mlb: 'MLB',
  icehockey_nhl: 'NHL',
  basketball_nba: 'NBA',
  basketball_wnba: 'WNBA',
  basketball_ncaab: 'NCAAB',
  soccer_usa_mls: 'MLS',
  soccer_epl: 'EPL',
};

export function novigEventUrl(eventId: string): string {
  return `https://novig.com/event-markets/${eventId}`;
}

export interface NovigGameOdds {
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  link: string;
  h2h: { homePrice: number; awayPrice: number } | null;
  spread: { homePoint: number; homePrice: number; awayPrice: number } | null;
  total: { point: number; overPrice: number; underPrice: number } | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

const EVENTS_QUERY = `
query OddsDayNovigGames($league: String!, $from: timestamptz!, $to: timestamptz!) {
  event(
    where: {
      league: { _eq: $league }
      type: { _eq: "Game" }
      scheduled_start: { _gte: $from, _lte: $to }
    }
    order_by: { scheduled_start: asc }
  ) {
    id
    description
    status
    scheduled_start
    game {
      homeTeam { name symbol }
      awayTeam { name symbol }
    }
    markets(where: { type: { _in: ["MONEY", "SPREAD", "TOTAL"] }, status: { _eq: "OPEN" } }) {
      type
      strike
      volume
      outcomes(order_by: { index: asc }) {
        index
        description
        available
      }
    }
  }
}`;

/** Novig price ($ per $1 payout) → American odds. */
export function novigPriceToAmerican(p: number): number | null {
  if (!(p > 0 && p < 1)) return null;
  if (p === 0.5) return -100;
  return p < 0.5 ? Math.round(((1 - p) / p) * 100) : Math.round((-p / (1 - p)) * 100);
}

interface RawOutcome { index: number; description: string; available: number | null }
interface RawMarket { type: string; strike: number | null; volume: number | null; outcomes: RawOutcome[] }

/** Two-sided market with both prices quoted. */
function priced(m: RawMarket): boolean {
  return m.outcomes.length === 2 && m.outcomes.every(o => o.available != null && o.available > 0 && o.available < 1);
}

/** Main line: most volume; ties / no volume → the most balanced two-way price. */
function pickMainMarket(markets: RawMarket[]): RawMarket | null {
  const candidates = markets.filter(priced);
  if (candidates.length === 0) return null;
  const balance = (m: RawMarket) => Math.abs((m.outcomes[0].available ?? 0) - (m.outcomes[1].available ?? 0));
  return candidates.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0) || balance(a) - balance(b))[0];
}

/** Which side an outcome belongs to, by its "BUF -4.5" / "DET" description. */
function sideOf(desc: string, homeSymbol: string, awaySymbol: string, index: number): 'home' | 'away' {
  const first = desc.trim().split(/\s+/)[0]?.toUpperCase();
  if (first && homeSymbol && first === homeSymbol.toUpperCase()) return 'home';
  if (first && awaySymbol && first === awaySymbol.toUpperCase()) return 'away';
  return index === 0 ? 'home' : 'away';
}

function parseTeams(event: any): { home: string; away: string; homeSymbol: string; awaySymbol: string } | null {
  const home = event.game?.homeTeam?.name;
  const away = event.game?.awayTeam?.name;
  if (home && away) {
    return { home, away, homeSymbol: event.game.homeTeam.symbol ?? '', awaySymbol: event.game.awayTeam.symbol ?? '' };
  }
  // Fallback: "Away @ Home" description
  const m = /^(.+?)\s+@\s+(.+)$/.exec(event.description ?? '');
  return m ? { home: m[2].trim(), away: m[1].trim(), homeSymbol: '', awaySymbol: '' } : null;
}

export function buildNovigGameOdds(event: any): NovigGameOdds | null {
  const teams = parseTeams(event);
  if (!teams) return null;
  const markets: RawMarket[] = Array.isArray(event.markets) ? event.markets : [];
  const byType = (t: string) => markets.filter(m => m.type === t);

  let h2h: NovigGameOdds['h2h'] = null;
  const money = pickMainMarket(byType('MONEY'));
  if (money) {
    const prices: Record<'home' | 'away', number | null> = { home: null, away: null };
    for (const o of money.outcomes) {
      prices[sideOf(o.description, teams.homeSymbol, teams.awaySymbol, o.index)] = novigPriceToAmerican(o.available as number);
    }
    if (prices.home != null && prices.away != null) h2h = { homePrice: prices.home, awayPrice: prices.away };
  }

  let spread: NovigGameOdds['spread'] = null;
  const sp = pickMainMarket(byType('SPREAD'));
  if (sp) {
    const prices: Record<'home' | 'away', number | null> = { home: null, away: null };
    let homePoint: number | null = null;
    for (const o of sp.outcomes) {
      const side = sideOf(o.description, teams.homeSymbol, teams.awaySymbol, o.index);
      prices[side] = novigPriceToAmerican(o.available as number);
      // "BUF -4.5" carries the side's own line; prefer it over the market strike
      const num = /([+-]?\d+(?:\.\d+)?)\s*$/.exec(o.description ?? '');
      if (num && side === 'home') homePoint = Number(num[1]);
    }
    if (homePoint == null && sp.strike != null) homePoint = Number(sp.strike);
    if (prices.home != null && prices.away != null && homePoint != null && Number.isFinite(homePoint)) {
      spread = { homePoint, homePrice: prices.home, awayPrice: prices.away };
    }
  }

  let total: NovigGameOdds['total'] = null;
  const tot = pickMainMarket(byType('TOTAL'));
  if (tot) {
    const over = tot.outcomes.find(o => /^over/i.test(o.description ?? ''));
    const under = tot.outcomes.find(o => /^under/i.test(o.description ?? ''));
    const point = tot.strike != null ? Number(tot.strike) : null;
    const overPrice = over ? novigPriceToAmerican(over.available as number) : null;
    const underPrice = under ? novigPriceToAmerican(under.available as number) : null;
    if (point != null && Number.isFinite(point) && overPrice != null && underPrice != null) {
      total = { point, overPrice, underPrice };
    }
  }

  if (!h2h && !spread && !total) return null;
  return {
    eventId: String(event.id),
    homeTeam: teams.home,
    awayTeam: teams.away,
    commenceTime: event.scheduled_start,
    link: novigEventUrl(String(event.id)),
    h2h,
    spread,
    total,
  };
}

const cache = new Map<string, { at: number; games: NovigGameOdds[] }>();
const CACHE_TTL_MS = 60 * 1000;
const LOOKBACK_MS = 5 * 60 * 60 * 1000;      // keep in-progress games (Novig prices live)
const LOOKAHEAD_MS = 10 * 24 * 60 * 60 * 1000;

export async function fetchNovigOdds(sportKey: string): Promise<NovigGameOdds[]> {
  const league = SPORT_TO_NOVIG_LEAGUE[sportKey];
  if (!league) return [];
  const hit = cache.get(league);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.games;

  const now = Date.now();
  const res = await fetch(NOVIG_GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: EVENTS_QUERY,
      variables: {
        league,
        from: new Date(now - LOOKBACK_MS).toISOString(),
        to: new Date(now + LOOKAHEAD_MS).toISOString(),
      },
    }),
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Novig GraphQL HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(`Novig GraphQL: ${JSON.stringify(json.errors).slice(0, 200)}`);

  const games: NovigGameOdds[] = [];
  for (const event of json.data?.event ?? []) {
    const g = buildNovigGameOdds(event);
    if (g) games.push(g);
  }
  cache.set(league, { at: Date.now(), games });
  return games;
}
