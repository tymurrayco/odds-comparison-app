// src/lib/server/boardOdds.ts
//
// Server-side twin of the browser's fetchOdds() (src/lib/api.ts) for the
// server-rendered sport pages (/nfl, /nba, ...). Same Odds API URL as
// /api/odds — byte-identical on purpose, so the Next data cache entry is
// SHARED between this page and the route: a visitor's board fetch and a page
// regeneration within the same 60s cost one paid call, not two. Kalshi and
// Novig are merged exactly as the browser does it.

import {
  ODDS_API_BOOKMAKERS,
  dropOffMarketExchangeLines,
  mergeKalshiOdds,
  mergeNovigOdds,
  type Game,
} from '@/lib/api';
import { fetchKalshiOdds } from '@/lib/kalshi';
import { fetchNovigOdds } from '@/lib/novig';

export async function getBoardGames(sportKey: string): Promise<Game[]> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return [];

  const apiUrl = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${apiKey}&bookmakers=${ODDS_API_BOOKMAKERS.join(',')}&markets=h2h,spreads,totals&oddsFormat=american&includeLinks=true`;

  const [oddsRes, kalshi, novig] = await Promise.all([
    fetch(apiUrl, { next: { revalidate: 60 } }).catch(() => null),
    fetchKalshiOdds(sportKey).catch(() => null),
    fetchNovigOdds(sportKey).catch(() => []),
  ]);

  if (!oddsRes || !oddsRes.ok) {
    console.error('[boardOdds] Odds API', oddsRes?.status ?? 'unreachable', sportKey);
    return [];
  }

  const games = dropOffMarketExchangeLines((await oddsRes.json()) as Game[]);
  if (kalshi) mergeKalshiOdds(games, kalshi.moneyline, kalshi.spreads, kalshi.totals);
  mergeNovigOdds(games, Array.isArray(novig) ? novig : []);
  return games;
}
