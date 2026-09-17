// src/app/api/fbs/sos/route.ts

/**
 * GET /api/fbs/sos[?season=][&fresh=1]
 * Per-team, per-game strength-of-schedule inputs for every FBS team
 * (src/lib/fbs/sos.ts): opponent rating, venue edge and the chance a
 * median FBS team wins from that seat. Ratings only move on a sync, so the
 * result is cached in-process for 5 minutes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { FBS_SEASON } from '@/lib/fbs/constants';
import { loadFbsConfig, loadFbsRatings } from '@/lib/fbs/supabase';
import { loadFcsRatings } from '@/lib/fcs/supabase';
import { fetchFbsSeasonSchedule } from '@/lib/fbs/futures';
import { buildFbsSos } from '@/lib/fbs/sos';
import { SosResult } from '@/lib/sos';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TTL_MS = 5 * 60 * 1000;
let cache: { season: number; at: number; result: SosResult & { generatedAt: string } } | null = null;

export async function GET(request: NextRequest) {
  try {
    const season = Number(request.nextUrl.searchParams.get('season')) || FBS_SEASON;
    const fresh = request.nextUrl.searchParams.get('fresh') === '1';
    if (!fresh && cache && cache.season === season && Date.now() - cache.at < TTL_MS) {
      return NextResponse.json({ success: true, cached: true, ...cache.result });
    }
    const [config, fbs, fcs, schedule] = await Promise.all([
      loadFbsConfig(),
      loadFbsRatings(season),
      loadFcsRatings(),
      fetchFbsSeasonSchedule(season),
    ]);
    const result = { ...buildFbsSos(season, schedule, fbs, fcs, config.hfaDefault), generatedAt: new Date().toISOString() };
    cache = { season, at: Date.now(), result };
    return NextResponse.json(
      { success: true, cached: false, ...result },
      { headers: { 'Cache-Control': 's-maxage=120, stale-while-revalidate=180' } }
    );
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
