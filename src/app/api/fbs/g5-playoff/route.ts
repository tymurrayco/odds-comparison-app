// src/app/api/fbs/g5-playoff/route.ts

/**
 * GET /api/fbs/g5-playoff[?penalty=4][&season=][&fresh=1]
 * Group of Five playoff odds (src/lib/fbs/g5Playoff.ts): every G5 team's
 * chance to win its league and to be the committee's top G5 champion, from
 * a 5,000-run season simulation. `penalty` = rating points one loss costs
 * in the committee score (0–10, halves). Cached in-process per penalty for
 * five minutes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { FBS_SEASON } from '@/lib/fbs/constants';
import { loadFbsConfig, loadFbsRatings } from '@/lib/fbs/supabase';
import { loadFcsRatings } from '@/lib/fcs/supabase';
import { fetchFbsSeasonSchedule } from '@/lib/fbs/futures';
import { buildG5Playoff, DEFAULT_LOSS_PENALTY, G5Result, G5_SIMS } from '@/lib/fbs/g5Playoff';
import { FUTURES_SIGMA } from '@/lib/fbs/futures';
import { clampWindow } from '@/lib/fbs/timing';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; result: G5Result & { generatedAt: string } }>();

export async function GET(request: NextRequest) {
  try {
    const season = Number(request.nextUrl.searchParams.get('season')) || FBS_SEASON;
    const raw = Number(request.nextUrl.searchParams.get('penalty'));
    const penalty = Number.isFinite(raw) && request.nextUrl.searchParams.has('penalty')
      ? Math.max(0, Math.min(10, Math.round(raw * 2) / 2))
      : DEFAULT_LOSS_PENALTY;
    const fresh = request.nextUrl.searchParams.get('fresh') === '1';
    const window = clampWindow(request.nextUrl.searchParams.get('window'));
    const key = `${season}:${penalty}:${window}`;
    const hit = cache.get(key);
    if (!fresh && hit && Date.now() - hit.at < TTL_MS) {
      return NextResponse.json({ success: true, cached: true, ...hit.result });
    }
    const [config, fbs, fcs, schedule] = await Promise.all([
      loadFbsConfig(),
      loadFbsRatings(season),
      loadFcsRatings(),
      fetchFbsSeasonSchedule(season),
    ]);
    const result = { ...buildG5Playoff(season, schedule, fbs, fcs, config.hfaDefault, penalty, G5_SIMS, FUTURES_SIGMA, window), generatedAt: new Date().toISOString() };
    cache.set(key, { at: Date.now(), result });
    return NextResponse.json(
      { success: true, cached: false, ...result },
      { headers: { 'Cache-Control': 's-maxage=120, stale-while-revalidate=180' } }
    );
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
