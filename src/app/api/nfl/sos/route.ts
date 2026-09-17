// src/app/api/nfl/sos/route.ts

/**
 * GET /api/nfl/sos[?season=][&fresh=1]
 * Per-team, per-game strength-of-schedule inputs for every NFL team
 * (src/lib/nfl/sos.ts): opponent rating, venue edge and the chance a
 * median NFL team wins from that seat. Cached in-process for 5 minutes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { NFL_SEASON } from '@/lib/nfl/constants';
import { loadNflConfig, loadNflRatings } from '@/lib/nfl/supabase';
import { buildNflSos, fetchNflSosSchedule } from '@/lib/nfl/sos';
import { SosResult } from '@/lib/sos';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TTL_MS = 5 * 60 * 1000;
let cache: { season: number; at: number; result: SosResult & { generatedAt: string } } | null = null;

export async function GET(request: NextRequest) {
  try {
    const season = Number(request.nextUrl.searchParams.get('season')) || NFL_SEASON;
    const fresh = request.nextUrl.searchParams.get('fresh') === '1';
    if (!fresh && cache && cache.season === season && Date.now() - cache.at < TTL_MS) {
      return NextResponse.json({ success: true, cached: true, ...cache.result });
    }
    const [config, ratings, schedule] = await Promise.all([
      loadNflConfig(),
      loadNflRatings(season),
      fetchNflSosSchedule(season),
    ]);
    const result = { ...buildNflSos(season, schedule, ratings, config.hfaDefault), generatedAt: new Date().toISOString() };
    cache = { season, at: Date.now(), result };
    return NextResponse.json(
      { success: true, cached: false, ...result },
      { headers: { 'Cache-Control': 's-maxage=120, stale-while-revalidate=180' } }
    );
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
