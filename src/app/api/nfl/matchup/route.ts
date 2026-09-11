// src/app/api/nfl/matchup/route.ts

/**
 * GET /api/nfl/matchup?teams=<away odds name>,<home odds name>[&neutral=1]
 *
 * One-game projection from the NFL Ledger (market-implied seed + closing-line
 * adjustments, src/lib/nfl) — the numbers behind the Upcoming tab on /nfl,
 * exposed per matchup for the game-card Ledger chip/tab. Same response shape
 * as /api/fbs/matchup (system 'nfl', no scale bridge).
 * Spreads are home-perspective (negative = home favored).
 */

import { NextRequest, NextResponse } from 'next/server';
import { hfaForGame, projectNflSpread, roundToDecimal } from '@/lib/nfl/engine';
import { loadNflConfig, loadNflRatings } from '@/lib/nfl/supabase';
import { NflTeamRating } from '@/lib/nfl/types';
import { matchNflTeam } from '@/lib/nfl/teamNames';
import { nflLogoUrl } from '@/lib/nfl/constants';
import type { MatchupSide } from '@/lib/fbs/matchupTypes';
import { loadTotalsSnapshot, projectGame } from '@/lib/nfl/totals/service';

export const dynamic = 'force-dynamic';

// Every NFL game card requests its matchup on mount; share one snapshot per
// lambda instance for a minute (same pattern as the FBS route).
type Snapshot = Awaited<ReturnType<typeof loadSnapshot>>;
const SNAPSHOT_TTL_MS = 60 * 1000;
let snapshotCache: { at: number; promise: Promise<Snapshot> } | null = null;

async function loadSnapshot() {
  const [config, ratings] = await Promise.all([loadNflConfig(), loadNflRatings()]);
  const totals = await loadTotalsSnapshot().catch(() => null);
  return { config, ratings, totals };
}

function cachedSnapshot(): Promise<Snapshot> {
  if (snapshotCache && Date.now() - snapshotCache.at < SNAPSHOT_TTL_MS) return snapshotCache.promise;
  const promise = loadSnapshot().catch((err) => {
    snapshotCache = null;
    throw err;
  });
  snapshotCache = { at: Date.now(), promise };
  return promise;
}

function side(requested: string, hit: NflTeamRating | null, rank: number | null, of: number | null): MatchupSide {
  if (!hit) {
    return {
      requested, matched: false, division: null, teamName: null, espnName: null, espnId: null,
      logo: null, rating: null, ratingOnScale: null, seedRating: null, delta: null, rank: null,
      of: null, gamesProcessed: null, hfa: null, conference: null,
    };
  }
  return {
    requested,
    matched: true,
    division: 'nfl',
    teamName: hit.teamName,
    espnName: hit.espnName,
    espnId: hit.espnId,
    logo: nflLogoUrl(hit.espnAbbr),
    rating: hit.rating,
    ratingOnScale: hit.rating,
    seedRating: hit.initialRating,
    delta: roundToDecimal(hit.rating - hit.initialRating, 2),
    rank,
    of,
    gamesProcessed: hit.gamesProcessed,
    hfa: hit.hfa,
    conference: hit.conference,
  };
}

export async function GET(request: NextRequest) {
  try {
    const teamsParam = request.nextUrl.searchParams.get('teams') ?? '';
    const [awayName, homeName] = teamsParam.split(',').map((s) => s.trim());
    if (!awayName || !homeName) {
      return NextResponse.json({ success: false, error: 'teams must be "away,home"' }, { status: 400 });
    }
    const neutral = request.nextUrl.searchParams.get('neutral') === '1';

    const { config, ratings, totals } = await cachedSnapshot();
    const sorted = [...ratings.values()].sort((a, b) => b.rating - a.rating);
    // Odds API names are ESPN displayNames for the NFL; matchNflTeam adds the
    // alias table on top for anything that drifts.
    const pseudoEspn = sorted.map((r) => ({
      id: r.espnId ?? r.teamName,
      location: '',
      displayName: r.espnName ?? r.teamName,
      shortDisplayName: '',
      nickname: '',
      abbreviation: r.espnAbbr ?? '',
    }));
    const byEspnName = new Map(sorted.map((r) => [r.espnName ?? r.teamName, r]));

    const resolve = (oddsName: string) => {
      const t = matchNflTeam(oddsName, pseudoEspn);
      const hit = t ? byEspnName.get(t.displayName) ?? null : null;
      return { hit, rank: hit ? sorted.indexOf(hit) + 1 : null, of: hit ? sorted.length : null };
    };
    const a = resolve(awayName);
    const h = resolve(homeName);
    const tot = a.hit && h.hit && totals && totals.teams.size > 0 ? projectGame(h.hit.teamName, a.hit.teamName, totals) : null;

    let hfaApplied: number | null = null;
    let homeSpread: number | null = null;
    let neutralSpread: number | null = null;
    if (a.hit && h.hit) {
      hfaApplied = hfaForGame(h.hit, neutral, config.hfaDefault);
      homeSpread = projectNflSpread(h.hit.rating, a.hit.rating, hfaApplied);
      neutralSpread = projectNflSpread(h.hit.rating, a.hit.rating, 0);
    }
    const updatedAt =
      [a.hit?.updatedAt, h.hit?.updatedAt].filter((x): x is string => !!x).sort().pop() ?? null;

    return NextResponse.json(
      {
        success: true,
        system: a.hit && h.hit ? 'nfl' : null,
        season: config.season,
        isNeutralSite: neutral,
        away: side(awayName, a.hit, a.rank, a.of),
        home: side(homeName, h.hit, h.rank, h.of),
        hfaApplied,
        homeSpread,
        neutralSpread,
        scaleOffset: null,
        scaleOffsetSource: null,
        totals: tot
          ? {
              projected: tot.projected, fundTotal: tot.fundTotal, plays: tot.plays,
              homePts: tot.homePts, awayPts: tot.awayPts, homeTerm: tot.homeTerm, awayTerm: tot.awayTerm,
              homePace: tot.home.pace, awayPace: tot.away.pace,
            }
          : null,
        seedLabel: `Market-implied ${config.season} preseason seed (season lines)`,
        updatedAt,
      },
      { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' } }
    );
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
