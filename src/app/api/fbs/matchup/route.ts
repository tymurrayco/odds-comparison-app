// src/app/api/fbs/matchup/route.ts

/**
 * GET /api/fbs/matchup?teams=<away odds name>,<home odds name>[&neutral=1]
 *
 * One-game projection from the MARKET-DRIVEN ratings (Brad Powers seed +
 * closing-line adjustments, src/lib/fbs) — the same numbers behind the
 * Upcoming tab on /fbs, exposed per matchup for the game-card "Market" tab.
 * FCS-vs-FCS games project from the FCS system; FBS-vs-FCS games bridge the
 * FCS rating onto the FBS scale with the FALLBACK offset (the Upcoming tab
 * calibrates that offset from the week's lined cross games; this endpoint
 * has no window to calibrate from, so it says so in `scaleOffsetSource`).
 *
 * Odds-API names are resolved to ESPN ids with the shared espnTeamMatch
 * helper, then looked up by espn_id in whichever ratings table has them.
 * Spreads are home-perspective (negative = home favored).
 */

import { NextRequest, NextResponse } from 'next/server';
import { hfaForGame, projectFbsSpread, roundToDecimal } from '@/lib/fbs/engine';
import { loadFbsConfig, loadFbsRatings } from '@/lib/fbs/supabase';
import { loadFcsConfig, loadFcsRatings } from '@/lib/fcs/supabase';
import { FbsTeamRating } from '@/lib/fbs/types';
import { FcsTeamRating } from '@/lib/fcs/types';
import { FCS_TO_FBS_OFFSET_FALLBACK } from '@/lib/crossDivision';
import { matchEspnTeam, EspnTeamLike } from '@/lib/espnTeamMatch';
import type { MatchupSide } from '@/lib/fbs/matchupTypes';

export const dynamic = 'force-dynamic';

const ESPN_ALL_CFB_TEAMS =
  'https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams?limit=1000';


type AnyRating = (FbsTeamRating & { division: 'fbs' }) | (FcsTeamRating & { division: 'fcs' });

async function fetchEspnTeams(): Promise<EspnTeamLike[]> {
  const res = await fetch(ESPN_ALL_CFB_TEAMS, { next: { revalidate: 86400 } });
  if (!res.ok) throw new Error(`ESPN teams HTTP ${res.status}`);
  const json = await res.json();
  const entries: Array<{ team?: EspnTeamLike }> = json?.sports?.[0]?.leagues?.[0]?.teams ?? [];
  return entries.map((e) => e.team).filter((t): t is EspnTeamLike => !!t);
}

// Every NCAAF game card requests its own matchup on mount (the Ledger chip in
// the card header), so a page load is a burst of ~70 calls. Share one ratings
// snapshot per lambda instance for a minute rather than re-querying Supabase
// four times per call. The in-flight promise is cached so the burst coalesces;
// a failed load is dropped so the next call retries.
type Snapshot = Awaited<ReturnType<typeof loadSnapshot>>;
const SNAPSHOT_TTL_MS = 60 * 1000;
let snapshotCache: { at: number; promise: Promise<Snapshot> } | null = null;

async function loadSnapshot() {
  const [fbsConfig, fbsRatings, fcsConfig, fcsRatings, espnTeams] = await Promise.all([
    loadFbsConfig(),
    loadFbsRatings(),
    loadFcsConfig(),
    loadFcsRatings(),
    fetchEspnTeams(),
  ]);
  return { fbsConfig, fbsRatings, fcsConfig, fcsRatings, espnTeams };
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

function side(
  requested: string,
  hit: AnyRating | null,
  rank: number | null,
  of: number | null,
  ratingOnScale: number | null
): MatchupSide {
  if (!hit) {
    return {
      requested, matched: false, division: null, teamName: null, espnName: null, espnId: null,
      logo: null, rating: null, ratingOnScale: null, seedRating: null, delta: null, rank: null, of: null,
      gamesProcessed: null, hfa: null, conference: null,
    };
  }
  return {
    requested,
    matched: true,
    division: hit.division,
    teamName: hit.teamName,
    espnName: hit.espnName,
    espnId: hit.espnId,
    logo: hit.espnId ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${hit.espnId}.png` : null,
    rating: hit.rating,
    ratingOnScale,
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

    const { fbsConfig, fbsRatings, fcsConfig, fcsRatings, espnTeams } = await cachedSnapshot();

    const fbsSorted = Array.from(fbsRatings.values()).sort((a, b) => b.rating - a.rating);
    const fcsSorted = Array.from(fcsRatings.values()).sort((a, b) => b.rating - a.rating);
    const fbsByEspn = new Map<string, FbsTeamRating>();
    for (const r of fbsSorted) if (r.espnId) fbsByEspn.set(r.espnId, r);
    const fcsByEspn = new Map<string, FcsTeamRating>();
    for (const r of fcsSorted) if (r.espnId) fcsByEspn.set(r.espnId, r);

    const resolve = (oddsName: string): { hit: AnyRating | null; rank: number | null; of: number | null } => {
      const espn = matchEspnTeam(oddsName, espnTeams);
      const id = espn ? String(espn.id) : null;
      if (!id) return { hit: null, rank: null, of: null };
      const fbs = fbsByEspn.get(id);
      if (fbs) return { hit: { ...fbs, division: 'fbs' }, rank: fbsSorted.indexOf(fbs) + 1, of: fbsSorted.length };
      const fcs = fcsByEspn.get(id);
      if (fcs) return { hit: { ...fcs, division: 'fcs' }, rank: fcsSorted.indexOf(fcs) + 1, of: fcsSorted.length };
      return { hit: null, rank: null, of: null };
    };

    const a = resolve(awayName);
    const h = resolve(homeName);

    let system: 'fbs' | 'fcs' | 'cross' | null = null;
    let scaleOffset: number | null = null;
    let awayOnScale: number | null = a.hit?.rating ?? null;
    let homeOnScale: number | null = h.hit?.rating ?? null;
    let hfaApplied: number | null = null;
    let homeSpread: number | null = null;
    let neutralSpread: number | null = null;

    if (a.hit && h.hit) {
      if (a.hit.division === 'fbs' && h.hit.division === 'fbs') {
        system = 'fbs';
        hfaApplied = hfaForGame(h.hit, neutral, fbsConfig.hfaDefault);
      } else if (a.hit.division === 'fcs' && h.hit.division === 'fcs') {
        system = 'fcs';
        hfaApplied = neutral ? 0 : (h.hit.hfa ?? fcsConfig.hfaDefault);
      } else {
        system = 'cross';
        scaleOffset = FCS_TO_FBS_OFFSET_FALLBACK;
        if (a.hit.division === 'fcs') awayOnScale = roundToDecimal(a.hit.rating + scaleOffset, 2);
        if (h.hit.division === 'fcs') homeOnScale = roundToDecimal(h.hit.rating + scaleOffset, 2);
        hfaApplied = neutral
          ? 0
          : h.hit.division === 'fbs'
            ? hfaForGame(h.hit, false, fbsConfig.hfaDefault)
            : (h.hit.hfa ?? fcsConfig.hfaDefault);
      }
      // projectFbsSpread is pure arithmetic (rating gap + HFA, 1dp) — identical
      // to the FCS engine's projection, so one call serves every division.
      homeSpread = projectFbsSpread(homeOnScale!, awayOnScale!, hfaApplied);
      neutralSpread = projectFbsSpread(homeOnScale!, awayOnScale!, 0);
    }

    const updatedAt = [a.hit?.updatedAt, h.hit?.updatedAt].filter((x): x is string => !!x).sort().pop() ?? null;

    return NextResponse.json(
      {
        success: true,
        system,
        season: fbsConfig.season,
        isNeutralSite: neutral,
        away: side(awayName, a.hit, a.rank, a.of, awayOnScale),
        home: side(homeName, h.hit, h.rank, h.of, homeOnScale),
        hfaApplied,
        homeSpread,
        neutralSpread,
        scaleOffset,
        scaleOffsetSource: scaleOffset === null ? null : 'fallback',
        seedLabel:
          system === 'fcs'
            ? `Massey ${fcsConfig.season} preseason seed`
            : system === 'cross'
              ? `Brad Powers / Massey ${fbsConfig.season} preseason seeds`
              : `Brad Powers ${fbsConfig.season} preseason seed`,
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
