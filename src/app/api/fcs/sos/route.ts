// src/app/api/fcs/sos/route.ts

/**
 * GET /api/fcs/sos[?season=][&fresh=1]
 * Per-team, per-game strength-of-schedule inputs for every FCS team
 * (src/lib/fcs/sos.ts): opponent rating (FBS opponents bridged down),
 * venue edge and the chance a median FCS team wins from that seat.
 * Cached in-process for 5 minutes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { FCS_SEASON } from '@/lib/fcs/constants';
import { loadFcsConfig, loadFcsRatings } from '@/lib/fcs/supabase';
import { loadFbsRatings } from '@/lib/fbs/supabase';
import { buildFcsSos, fetchFcsSeasonSchedule } from '@/lib/fcs/sos';
import { SosResult } from '@/lib/sos';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TTL_MS = 5 * 60 * 1000;
let cache: { season: number; at: number; result: SosResult & { generatedAt: string } } | null = null;

export async function GET(request: NextRequest) {
  try {
    const season = Number(request.nextUrl.searchParams.get('season')) || FCS_SEASON;
    const fresh = request.nextUrl.searchParams.get('fresh') === '1';
    if (!fresh && cache && cache.season === season && Date.now() - cache.at < TTL_MS) {
      return NextResponse.json({ success: true, cached: true, ...cache.result });
    }
    const [config, fcs, fbs, schedule] = await Promise.all([
      loadFcsConfig(),
      loadFcsRatings(season),
      loadFbsRatings(),
      fetchFcsSeasonSchedule(season),
    ]);
    const result = { ...buildFcsSos(season, schedule, fcs, fbs, config.hfaDefault), generatedAt: new Date().toISOString() };
    cache = { season, at: Date.now(), result };
    return NextResponse.json(
      { success: true, cached: false, ...result },
      { headers: { 'Cache-Control': 's-maxage=120, stale-while-revalidate=180' } }
    );
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
