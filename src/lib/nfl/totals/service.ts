// src/lib/nfl/totals/service.ts

/**
 * NFL totals Ledger — orchestration shared by the API route, the Upcoming
 * feed and the matchup endpoint: current fundamentals per team, one-game
 * projection, and the fetch of the posted totals used to seed.
 */

import { loadSeasonStats, TeamGameStats } from '@/lib/football/boxScores';
import { NFL_CONSENSUS_BOOKS, NFL_SPORT_KEY, ODDS_API_BASE_URL } from '../constants';
import { matchNflTeam, EspnTeam } from '../teamNames';
import {
  blendFundamentals,
  projectTotal,
  rawTeamStats,
  TeamFundamentals,
  TotalLine,
  TotalsProjection,
} from './model';
import { loadTotalsConfig, loadTotalsTeams, TotalsConfig, TotalsTeam } from './supabase';

export interface TotalsSnapshot {
  config: TotalsConfig;
  teams: Map<string, TotalsTeam>; // by teamName
  stats: TeamGameStats[];          // current season rows
}

export async function loadTotalsSnapshot(season?: number): Promise<TotalsSnapshot> {
  const config = await loadTotalsConfig();
  const s = season ?? config.season;
  const [teams, stats] = await Promise.all([loadTotalsTeams(s), loadSeasonStats('nfl', s)]);
  return { config, teams, stats };
}

/** Blended fundamentals for one team as of a date (all games so far if omitted). */
export function fundamentalsFor(
  team: TotalsTeam,
  snap: TotalsSnapshot,
  beforeIso?: string
): TeamFundamentals {
  const raw = team.espnId ? rawTeamStats(snap.stats, team.espnId, beforeIso) : null;
  return blendFundamentals(
    { pace: team.priorPace, offPpp: team.priorOffPpp, defPpp: team.priorDefPpp },
    raw,
    snap.config.blendK
  );
}

export interface GameTotals extends TotalsProjection {
  home: TeamFundamentals;
  away: TeamFundamentals;
  homeTerm: number;
  awayTerm: number;
}

/** Projection for a home/away pair (null if either side isn't in the totals table). */
export function projectGame(
  homeName: string,
  awayName: string,
  snap: TotalsSnapshot,
  beforeIso?: string
): GameTotals | null {
  const h = snap.teams.get(homeName);
  const a = snap.teams.get(awayName);
  if (!h || !a) return null;
  const home = fundamentalsFor(h, snap, beforeIso);
  const away = fundamentalsFor(a, snap, beforeIso);
  const p = projectTotal(home, away, h.marketTerm, a.marketTerm, snap.config.leagueAvgPpp);
  return { ...p, home, away, homeTerm: h.marketTerm, awayTerm: a.marketTerm };
}

/** Average the total across consensus books from one Odds API event. */
export function extractConsensusTotal(
  event: { bookmakers?: Array<{ key: string; markets?: Array<{ key: string; outcomes?: Array<{ name: string; point?: number }> }> }> },
  bookKeys: string[]
): { total: number; books: string[] } | null {
  const points: number[] = [];
  const books: string[] = [];
  for (const bk of event.bookmakers ?? []) {
    if (!bookKeys.includes(bk.key)) continue;
    const market = bk.markets?.find((m) => m.key === 'totals');
    const over = market?.outcomes?.find((o) => o.name === 'Over') ?? market?.outcomes?.[0];
    if (over && typeof over.point === 'number') {
      points.push(over.point);
      books.push(bk.key);
    }
  }
  if (points.length === 0) return null;
  return { total: Math.round((points.reduce((x, y) => x + y, 0) / points.length) * 10) / 10, books };
}

/** Every posted total for games not yet kicked off (the totals seed input). */
export async function fetchSeasonTotals(espnTeams: EspnTeam[]): Promise<TotalLine[]> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) throw new Error('ODDS_API_KEY missing');
  const url =
    `${ODDS_API_BASE_URL}/sports/${NFL_SPORT_KEY}/odds` +
    `?apiKey=${apiKey}&regions=us&markets=totals&oddsFormat=american` +
    `&bookmakers=${NFL_CONSENSUS_BOOKS.join(',')}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Odds API HTTP ${res.status}: ${(await res.text()).slice(0, 150)}`);
  const events: Array<{ commence_time: string; home_team: string; away_team: string; bookmakers?: never[] }> = await res.json();
  const nowIso = new Date().toISOString();
  const out: TotalLine[] = [];
  for (const ev of events) {
    if (ev.commence_time <= nowIso) continue;
    const home = matchNflTeam(ev.home_team, espnTeams);
    const away = matchNflTeam(ev.away_team, espnTeams);
    if (!home || !away) continue;
    const c = extractConsensusTotal(ev, NFL_CONSENSUS_BOOKS);
    if (!c) continue;
    out.push({ home: home.displayName, away: away.displayName, total: c.total, books: c.books.length });
  }
  return out;
}
