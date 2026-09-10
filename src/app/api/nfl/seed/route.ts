// src/app/api/nfl/seed/route.ts

/**
 * POST /api/nfl/seed — seed/refresh nfl_ratings from the market-implied set.
 *
 * The set is stored in power_rating_sets (sport 'nfl', source 'market_fit',
 * one row per season) so the seed is reproducible and visible alongside the
 * other rating sets. It is built once from the pre-season lines
 * (src/lib/nfl/marketFit.ts) and reused on later seeds unless `refit` is set.
 *
 * Body: { season?, forceRefresh?, refit?, dryRun? }
 * - dryRun: build the fit and return it — writes nothing (no tables needed).
 * - refit: rebuild the stored set from today's lines before seeding.
 * - New teams are inserted with rating = initial_rating = seed rating.
 *   Existing teams only get metadata refreshed; forceRefresh re-seeds every
 *   team (follow with Recalculate if adjustments exist).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  NFL_DIVISIONS,
  NFL_SEASON,
  NFL_SEED_SOURCE,
  NFL_SEED_SOURCE_LABEL,
} from '@/lib/nfl/constants';
import { buildMarketSeed, fetchEspnNflTeams, SeedBuild } from '@/lib/nfl/marketFit';
import { loadNflRatings, upsertNflRatings } from '@/lib/nfl/supabase';
import { matchNflTeam } from '@/lib/nfl/teamNames';
import { NflTeamRating } from '@/lib/nfl/types';
import { PowerRatingRow } from '@/lib/powerRatings';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

interface StoredSet {
  rows: PowerRatingRow[];
  label: string;
  asOf: string | null;
}

async function loadStoredSet(season: number): Promise<StoredSet | null> {
  const { data, error } = await sb()
    .from('power_rating_sets')
    .select('source_label, as_of, ratings, updated_at')
    .eq('sport', 'nfl')
    .eq('source', NFL_SEED_SOURCE)
    .eq('season', season)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`power_rating_sets: ${error.message}`);
  const set = data?.[0];
  if (!set) return null;
  return { rows: (set.ratings ?? []) as PowerRatingRow[], label: set.source_label, asOf: set.as_of };
}

async function storeSet(season: number, build: SeedBuild): Promise<StoredSet> {
  const asOf = new Date().toISOString().substring(0, 10);
  const label =
    `${NFL_SEED_SOURCE_LABEL} — ${build.fit.games} lined games, HFA ${build.fit.hfa}, ` +
    `RMSE ${build.fit.rmse}` +
    (build.filled.length ? `; Sagarin fill: ${build.filled.map((f) => f.team).join(', ')}` : '');
  const { error } = await sb()
    .from('power_rating_sets')
    .upsert(
      {
        sport: 'nfl',
        source: NFL_SEED_SOURCE,
        source_label: label,
        season,
        as_of: asOf,
        ratings: build.rows,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'sport,source,season' }
    );
  if (error) throw new Error(`power_rating_sets upsert: ${error.message}`);
  return { rows: build.rows, label, asOf };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const season: number = body.season ?? NFL_SEASON;
    const forceRefresh: boolean = body.forceRefresh === true;
    const refit: boolean = body.refit === true;
    const dryRun: boolean = body.dryRun === true;

    if (dryRun) {
      const build = await buildMarketSeed(season);
      return NextResponse.json({ success: true, dryRun: true, season, ...build });
    }

    let set = refit ? null : await loadStoredSet(season);
    let build: SeedBuild | null = null;
    if (!set) {
      build = await buildMarketSeed(season);
      set = await storeSet(season, build);
    }

    const [espnTeams, existing] = await Promise.all([fetchEspnNflTeams(), loadNflRatings(season)]);
    const existingBySeed = new Map([...existing.values()].map((r) => [r.seedName, r]));
    const existingByEspnId = new Map(
      [...existing.values()].filter((r) => r.espnId).map((r) => [r.espnId as string, r])
    );

    const now = new Date().toISOString();
    const upserts: NflTeamRating[] = [];
    const unmatched: string[] = [];
    const usedNames = new Set<string>();
    let inserted = 0;
    let refreshed = 0;
    let reseeded = 0;

    for (const row of set.rows) {
      const match = matchNflTeam(row.team, espnTeams);
      const prior =
        existingBySeed.get(row.team) ?? (match ? existingByEspnId.get(match.id) : undefined);
      if (!match && !prior) {
        unmatched.push(row.team);
        continue;
      }
      const teamName = prior?.teamName ?? match!.displayName;
      if (usedNames.has(teamName)) {
        unmatched.push(`${row.team} (duplicate canonical: ${teamName})`);
        continue;
      }
      usedNames.add(teamName);
      const espnName = match?.displayName ?? prior?.espnName ?? null;
      const espnId = match?.id ?? prior?.espnId ?? null;
      const espnAbbr = match?.abbreviation ?? prior?.espnAbbr ?? null;
      const conference = row.conference ?? NFL_DIVISIONS[espnAbbr ?? ''] ?? prior?.conference ?? null;

      if (!prior) {
        inserted++;
        upserts.push({
          teamName, seedName: row.team, espnName, espnId, espnAbbr, conference,
          rating: row.thisYr, initialRating: row.thisYr, hfa: row.hfa ?? null,
          gamesProcessed: 0, season, updatedAt: now,
        });
      } else if (forceRefresh) {
        reseeded++;
        upserts.push({
          ...prior, seedName: row.team, espnName, espnId, espnAbbr, conference,
          rating: row.thisYr, initialRating: row.thisYr, hfa: row.hfa ?? null,
          gamesProcessed: 0, updatedAt: now,
        });
      } else {
        refreshed++;
        upserts.push({
          ...prior, seedName: row.team, espnName, espnId, espnAbbr, conference,
          hfa: row.hfa ?? prior.hfa, updatedAt: now,
        });
      }
    }

    await upsertNflRatings(upserts);

    return NextResponse.json({
      success: true,
      season,
      source: NFL_SEED_SOURCE,
      sourceLabel: set.label,
      asOf: set.asOf,
      refit: build !== null,
      fit: build?.fit ?? null,
      filled: build?.filled ?? null,
      seedTeams: set.rows.length,
      inserted,
      refreshed,
      reseeded,
      unmatched,
    });
  } catch (e) {
    console.error('nfl seed failed:', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
