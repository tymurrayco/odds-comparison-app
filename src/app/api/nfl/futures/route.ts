// src/app/api/nfl/futures/route.ts

/**
 * GET /api/nfl/futures[?season=][&window=3][&fresh=1]
 * Division, conference and Super Bowl probabilities for every NFL team from
 * the Ledger ratings and the remaining schedule (src/lib/nfl/futures.ts).
 * Ratings only move on a sync, so the result is cached in-process for
 * three minutes per timing window.
 */

import { NextRequest, NextResponse } from 'next/server';
import { NFL_SEASON } from '@/lib/nfl/constants';
import { loadNflConfig, loadNflRatings } from '@/lib/nfl/supabase';
import { fetchNflSosSchedule } from '@/lib/nfl/sos';
import { buildNflFutures, NflFuturesResult, NFL_FUTURES_SIMS } from '@/lib/nfl/futures';
import { SURVIVOR_SIGMA } from '@/lib/nfl/survivor';
import { clampWindow } from '@/lib/fbs/timing';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TTL_MS = 3 * 60 * 1000;
const cache = new Map<string, { at: number; result: NflFuturesResult & { generatedAt: string } }>();

export async function GET(request: NextRequest) {
  try {
    const season = Number(request.nextUrl.searchParams.get('season')) || NFL_SEASON;
    const window = clampWindow(request.nextUrl.searchParams.get('window'));
    const fresh = request.nextUrl.searchParams.get('fresh') === '1';
    const key = `${season}:${window}`;
    const hit = cache.get(key);
    if (!fresh && hit && Date.now() - hit.at < TTL_MS) {
      return NextResponse.json({ success: true, cached: true, ...hit.result });
    }
    const [config, ratings, schedule] = await Promise.all([
      loadNflConfig(),
      loadNflRatings(season),
      fetchNflSosSchedule(season),
    ]);
    const result = { ...buildNflFutures(season, schedule, ratings, config.hfaDefault, NFL_FUTURES_SIMS, SURVIVOR_SIGMA, window), generatedAt: new Date().toISOString() };
    cache.set(key, { at: Date.now(), result });
    return NextResponse.json(
      { success: true, cached: false, ...result },
      { headers: { 'Cache-Control': 's-maxage=120, stale-while-revalidate=180' } }
    );
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
