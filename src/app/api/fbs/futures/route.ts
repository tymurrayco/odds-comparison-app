// src/app/api/fbs/futures/route.ts

/**
 * GET /api/fbs/futures[?season=]
 * Regular-season conference title probabilities and fair prices for every
 * FBS conference, simulated from the Ledger ratings and the remaining
 * schedule (src/lib/fbs/futures.ts). Ratings only move on a sync, so the
 * result is cached in-process for 10 minutes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { FBS_SEASON } from '@/lib/fbs/constants';
import { loadFbsConfig, loadFbsRatings } from '@/lib/fbs/supabase';
import { loadFcsRatings } from '@/lib/fcs/supabase';
import { buildFutures, fetchFbsSeasonSchedule, FuturesResult } from '@/lib/fbs/futures';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TTL_MS = 10 * 60 * 1000;
let cache: { season: number; at: number; result: FuturesResult & { generatedAt: string } } | null = null;

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
    const result = { ...buildFutures(season, schedule, fbs, fcs, config.hfaDefault), generatedAt: new Date().toISOString() };
    cache = { season, at: Date.now(), result };
    return NextResponse.json(
      { success: true, cached: false, ...result },
      { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' } }
    );
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
