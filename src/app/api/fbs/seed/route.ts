// src/app/api/fbs/seed/route.ts

/**
 * POST /api/fbs/seed
 * Seeds/refreshes fbs_ratings from the Brad Powers set stored in
 * power_rating_sets (imported via /admin/power-ratings). No scraping —
 * works on Vercel, unlike the FCS Massey seed.
 *
 * Body: { season?: number, forceRefresh?: boolean, source?: string }
 * - New teams are inserted with rating = initial_rating = Powers rating.
 * - Existing teams only get metadata refreshed (hfa/conference/ESPN link);
 *   the market-adjusted rating is never clobbered unless forceRefresh, which
 *   re-seeds every team (follow with Recalculate All if adjustments exist).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { FBS_SEASON, FBS_SEED_SOURCE, ESPN_CFB_TEAMS_URL } from '@/lib/fbs/constants';
import { loadFbsRatings, upsertFbsRatings } from '@/lib/fbs/supabase';
import { EspnTeam, matchPowersToEspn } from '@/lib/fbs/teamNames';
import { FbsTeamRating } from '@/lib/fbs/types';
import { PowerRatingRow } from '@/lib/powerRatings';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function fetchEspnTeams(): Promise<EspnTeam[]> {
  const res = await fetch(ESPN_CFB_TEAMS_URL);
  if (!res.ok) throw new Error(`ESPN teams HTTP ${res.status}`);
  const json = await res.json();
  const teams = json?.sports?.[0]?.leagues?.[0]?.teams ?? [];
  return teams.map((t: { team: Record<string, string> }) => ({
    id: String(t.team.id),
    location: t.team.location ?? '',
    displayName: t.team.displayName ?? '',
    shortDisplayName: t.team.shortDisplayName ?? '',
    nickname: t.team.nickname ?? '',
    abbreviation: t.team.abbreviation ?? '',
  }));
}

async function loadPowersSet(
  season: number,
  source: string
): Promise<{ rows: PowerRatingRow[]; label: string; asOf: string | null }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const sb = createClient(url, key);
  const { data, error } = await sb
    .from('power_rating_sets')
    .select('source_label, as_of, ratings, updated_at')
    .eq('sport', 'ncaaf')
    .eq('source', source)
    .eq('season', season)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`power_rating_sets: ${error.message}`);
  const set = data?.[0];
  if (!set) {
    throw new Error(
      `No '${source}' ${season} set in power_rating_sets — import it at /admin/power-ratings first`
    );
  }
  return {
    rows: (set.ratings ?? []) as PowerRatingRow[],
    label: set.source_label,
    asOf: set.as_of,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const season: number = body.season ?? FBS_SEASON;
    const source: string = body.source ?? FBS_SEED_SOURCE;
    const forceRefresh: boolean = body.forceRefresh === true;

    const [powersSet, espnTeams, existing] = await Promise.all([
      loadPowersSet(season, source),
      fetchEspnTeams(),
      loadFbsRatings(season),
    ]);

    const existingByPowers = new Map(
      [...existing.values()].map((r) => [r.powersName, r])
    );
    const existingByEspnId = new Map(
      [...existing.values()].filter((r) => r.espnId).map((r) => [r.espnId as string, r])
    );

    const now = new Date().toISOString();
    const upserts: FbsTeamRating[] = [];
    const unmatched: string[] = [];
    const confidences: Record<string, number> = {};
    const usedNames = new Set<string>();
    let inserted = 0;
    let refreshed = 0;
    let reseeded = 0;

    for (const row of powersSet.rows) {
      const priorByPowers = existingByPowers.get(row.team);
      const match = priorByPowers?.espnName
        ? null // already linked; keep the stored linkage
        : matchPowersToEspn(row.team, espnTeams);
      // A Powers rename must land on the existing row (found via its ESPN id),
      // not create a "new team" whose canonical-name upsert would wipe the
      // market-adjusted rating back to the seed.
      const prior =
        priorByPowers ?? (match ? existingByEspnId.get(match.team.id) : undefined);

      let teamName: string;
      let espnName: string | null;
      let espnId: string | null;
      if (prior) {
        teamName = prior.teamName;
        espnName = prior.espnName ?? match?.team.displayName ?? null;
        espnId = prior.espnId ?? match?.team.id ?? null;
      } else if (match) {
        teamName = match.team.location || row.team;
        espnName = match.team.displayName;
        espnId = match.team.id;
        confidences[match.confidence] = (confidences[match.confidence] ?? 0) + 1;
      } else {
        teamName = row.team;
        espnName = null;
        espnId = null;
        unmatched.push(row.team);
      }

      // Guard against two Powers rows collapsing into one canonical name
      if (usedNames.has(teamName)) {
        unmatched.push(`${row.team} (duplicate canonical: ${teamName})`);
        continue;
      }
      usedNames.add(teamName);

      if (!prior) {
        inserted++;
        upserts.push({
          teamName,
          powersName: row.team,
          espnName,
          espnId,
          conference: row.conference,
          rating: row.thisYr,
          initialRating: row.thisYr,
          hfa: row.hfa ?? null,
          gamesProcessed: 0,
          season,
          updatedAt: now,
        });
      } else if (forceRefresh) {
        reseeded++;
        upserts.push({
          ...prior,
          powersName: row.team,
          espnName,
          espnId,
          conference: row.conference,
          rating: row.thisYr,
          initialRating: row.thisYr,
          hfa: row.hfa ?? null,
          gamesProcessed: 0,
          updatedAt: now,
        });
      } else {
        refreshed++;
        upserts.push({
          ...prior,
          powersName: row.team,
          espnName,
          espnId,
          conference: row.conference,
          hfa: row.hfa ?? prior.hfa,
          updatedAt: now,
        });
      }
    }

    await upsertFbsRatings(upserts);

    return NextResponse.json({
      success: true,
      season,
      source,
      sourceLabel: powersSet.label,
      asOf: powersSet.asOf,
      powersTeams: powersSet.rows.length,
      inserted,
      refreshed,
      reseeded,
      matchConfidence: confidences,
      unmatched,
      note: unmatched.length
        ? 'Unmatched teams were saved under their Powers name with no ESPN link — add entries to POWERS_ESPN_OVERRIDES in src/lib/fbs/teamNames.ts and re-run.'
        : undefined,
    });
  } catch (e) {
    console.error('fbs seed failed:', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
