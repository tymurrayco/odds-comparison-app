// src/app/api/box-scores/route.ts

/**
 * POST /api/box-scores — store per-team box scores for completed games
 * (football_game_stats), the input to the totals model.
 *
 * Body: { league?: 'nfl' | 'ncaaf' (default nfl), season?, startDate?,
 *         endDate?, maxGames?, fullScan? }
 * Default window: the last BOX_SCORE_LOOKBACK_DAYS up to today, clipped to
 * the season; fullScan sweeps from the season opener; startDate/endDate
 * override both. Games already stored are skipped, so re-running is cheap.
 * Each new game is one ~550KB ESPN fetch — maxGames (default 40) keeps a
 * call inside Vercel's limit; the response says how many remain.
 *
 * GET /api/box-scores?league=nfl&season=2026 — stored coverage summary.
 */

import { NextRequest, NextResponse } from 'next/server';
import { NFL_SEASON, NFL_SEASON_DATES } from '@/lib/nfl/constants';
import {
  FootballLeague,
  fetchCompletedGames,
  fetchGameStats,
  loadSeasonStats,
  syncBoxScores,
} from '@/lib/football/boxScores';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BOX_SCORE_LOOKBACK_DAYS = 14;

// Season windows per league (NFL from the Ledger constants; college seasons
// are added when the FBS/FCS totals models land).
const SEASON_DATES: Record<FootballLeague, Record<number, { start: string; end: string }>> = {
  nfl: NFL_SEASON_DATES,
  ncaaf: {
    2026: { start: '2026-08-22', end: '2027-01-25' },
    2025: { start: '2025-08-23', end: '2026-01-20' },
  },
};

function shiftYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().substring(0, 10);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const league: FootballLeague = body.league === 'ncaaf' ? 'ncaaf' : 'nfl';
    const season: number = body.season ?? NFL_SEASON;
    const dates = SEASON_DATES[league][season];
    if (!dates) throw new Error(`No season dates configured for ${league} ${season}`);

    const today = new Date().toISOString().substring(0, 10);
    const endDefault = today < dates.end ? today : dates.end;
    const startDefault = body.fullScan
      ? dates.start
      : [shiftYmd(endDefault, -BOX_SCORE_LOOKBACK_DAYS), dates.start].sort().pop()!;
    const startDate: string = body.startDate ?? startDefault;
    let endDate: string = body.endDate ?? endDefault;
    if (endDate > today) endDate = today;
    const maxGames = Math.min(Math.max(Number(body.maxGames) || 40, 1), 80);

    // dryRun: fetch + parse a few games and return the rows, no DB (works
    // before the table exists — verifies the ESPN parse end to end).
    if (body.dryRun === true) {
      const games = await fetchCompletedGames(league, startDate, endDate);
      const sample = games.slice(-Math.min(maxGames, 3));
      const rows = (await Promise.all(sample.map((g) => fetchGameStats(league, g)))).flat();
      return NextResponse.json({
        success: true,
        dryRun: true,
        league,
        season,
        range: { startDate, endDate },
        completedInWindow: games.length,
        rows,
      });
    }

    const result = await syncBoxScores(league, season, startDate, endDate, maxGames);
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error('box-scores sync failed:', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const league: FootballLeague =
      request.nextUrl.searchParams.get('league') === 'ncaaf' ? 'ncaaf' : 'nfl';
    const season = Number(request.nextUrl.searchParams.get('season')) || NFL_SEASON;
    const rows = await loadSeasonStats(league, season);
    const games = new Set(rows.map((r) => r.gameId)).size;
    const teams = new Map<string, { team: string; games: number; plays: number; points: number; yards: number }>();
    for (const r of rows) {
      if (r.seasonType === 1) continue; // preseason never feeds the model
      const t = teams.get(r.teamEspnId) ?? { team: r.teamName, games: 0, plays: 0, points: 0, yards: 0 };
      t.games++;
      t.plays += r.plays ?? 0;
      t.points += r.points;
      t.yards += r.totalYards ?? 0;
      teams.set(r.teamEspnId, t);
    }
    const byTeam = [...teams.values()]
      .map((t) => ({
        team: t.team,
        games: t.games,
        pace: t.games ? Math.round((t.plays / t.games) * 10) / 10 : null,
        ppp: t.plays ? Math.round((t.points / t.plays) * 1000) / 1000 : null,
        ypp: t.plays ? Math.round((t.yards / t.plays) * 100) / 100 : null,
      }))
      .sort((a, b) => a.team.localeCompare(b.team));
    const latest = rows.length ? rows[rows.length - 1].gameDate : null;
    return NextResponse.json({ success: true, league, season, games, rows: rows.length, latestGame: latest, teams: byTeam });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
