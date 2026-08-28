// src/app/api/fcs/massey-sync/route.ts

/**
 * POST /api/fcs/massey-sync
 * Scrapes Massey FCS ratings (puppeteer-stealth — run locally, not on Vercel)
 * and seeds/refreshes fcs_ratings.
 *
 * Body: { season?: number, forceRefresh?: boolean }
 * - New teams are inserted with rating = initial_rating = Massey Pwr.
 * - Existing teams only get metadata refreshed (hfa/conference/ESPN link);
 *   the market-adjusted rating is never clobbered unless forceRefresh, which
 *   re-seeds every team (follow with Recalculate All if adjustments exist).
 */

import { NextRequest, NextResponse } from 'next/server';
import { FCS_SEASON, ESPN_CFB_TEAMS_URL } from '@/lib/fcs/constants';
import { scrapeMasseyFcs } from '@/lib/fcs/massey';
import { loadFcsRatings, upsertFcsRatings } from '@/lib/fcs/supabase';
import {
  EspnTeam,
  matchMasseyToEspn,
  SUPPLEMENTAL_ESPN_TEAMS,
} from '@/lib/fcs/teamNames';
import { FcsTeamRating } from '@/lib/fcs/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function fetchEspnTeams(): Promise<EspnTeam[]> {
  const res = await fetch(ESPN_CFB_TEAMS_URL);
  if (!res.ok) throw new Error(`ESPN teams HTTP ${res.status}`);
  const json = await res.json();
  const teams = json?.sports?.[0]?.leagues?.[0]?.teams ?? [];
  const mapped: EspnTeam[] = teams.map((t: { team: Record<string, string> }) => ({
    id: String(t.team.id),
    location: t.team.location ?? '',
    displayName: t.team.displayName ?? '',
    shortDisplayName: t.team.shortDisplayName ?? '',
    nickname: t.team.nickname ?? '',
    abbreviation: t.team.abbreviation ?? '',
  }));
  const known = new Set(mapped.map((t) => t.id));
  return [...mapped, ...SUPPLEMENTAL_ESPN_TEAMS.filter((t) => !known.has(t.id))];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const season: number = body.season ?? FCS_SEASON;
    const forceRefresh: boolean = body.forceRefresh === true;

    const [masseyRows, espnTeams, existing] = await Promise.all([
      scrapeMasseyFcs(),
      fetchEspnTeams(),
      loadFcsRatings(season),
    ]);

    const existingByMassey = new Map(
      [...existing.values()].map((r) => [r.masseyName, r])
    );

    const now = new Date().toISOString();
    const upserts: FcsTeamRating[] = [];
    const unmatched: string[] = [];
    const confidences: Record<string, number> = {};
    const usedNames = new Set<string>();
    let inserted = 0;
    let refreshed = 0;
    let reseeded = 0;

    for (const row of masseyRows) {
      const prior = existingByMassey.get(row.masseyName);
      const match = prior?.espnName
        ? null // already linked; keep the stored linkage
        : matchMasseyToEspn(row.masseyName, espnTeams);

      let teamName: string;
      let espnName: string | null;
      let espnId: string | null;
      if (prior) {
        teamName = prior.teamName;
        espnName = prior.espnName ?? match?.team.displayName ?? null;
        espnId = prior.espnId ?? match?.team.id ?? null;
      } else if (match) {
        teamName = match.team.location || row.masseyName;
        espnName = match.team.displayName;
        espnId = match.team.id;
        confidences[match.confidence] = (confidences[match.confidence] ?? 0) + 1;
      } else {
        teamName = row.masseyName;
        espnName = null;
        espnId = null;
        unmatched.push(row.masseyName);
      }

      // Guard against two Massey rows collapsing into one canonical name
      if (usedNames.has(teamName)) {
        unmatched.push(`${row.masseyName} (duplicate canonical: ${teamName})`);
        continue;
      }
      usedNames.add(teamName);

      if (!prior) {
        inserted++;
        upserts.push({
          teamName,
          masseyName: row.masseyName,
          espnName,
          espnId,
          conference: row.conference,
          rating: row.pwr,
          initialRating: row.pwr,
          hfa: row.hfa,
          gamesProcessed: 0,
          season,
          updatedAt: now,
        });
      } else if (forceRefresh) {
        reseeded++;
        upserts.push({
          ...prior,
          espnName,
          espnId,
          conference: row.conference,
          rating: row.pwr,
          initialRating: row.pwr,
          hfa: row.hfa,
          gamesProcessed: 0,
          updatedAt: now,
        });
      } else {
        refreshed++;
        upserts.push({
          ...prior,
          espnName,
          espnId,
          conference: row.conference,
          hfa: row.hfa,
          updatedAt: now,
        });
      }
    }

    await upsertFcsRatings(upserts);

    return NextResponse.json({
      success: true,
      season,
      masseyTeams: masseyRows.length,
      inserted,
      refreshed,
      reseeded,
      matchConfidence: confidences,
      unmatched,
      note: unmatched.length
        ? 'Unmatched teams were saved under their Massey name with no ESPN link — add entries to MASSEY_ESPN_OVERRIDES in src/lib/fcs/teamNames.ts and re-run.'
        : undefined,
    });
  } catch (e) {
    console.error('massey-sync failed:', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
