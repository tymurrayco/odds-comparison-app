// src/app/api/fcs/ratings/route.ts

/**
 * GET /api/fcs/ratings?season=2026
 * Ratings table + config + recent adjustments for the admin page.
 */

import { NextRequest, NextResponse } from 'next/server';
import { FCS_SEASON } from '@/lib/fcs/constants';
import {
  loadFcsAdjustments,
  loadFcsConfig,
  loadFcsRatings,
  loadUnlinedFcsGames,
} from '@/lib/fcs/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const seasonParam = request.nextUrl.searchParams.get('season');
    const season = seasonParam ? parseInt(seasonParam, 10) : FCS_SEASON;

    const [ratings, config, adjustments, unlinedGames] = await Promise.all([
      loadFcsRatings(season),
      loadFcsConfig(),
      loadFcsAdjustments(season),
      loadUnlinedFcsGames(),
    ]);

    const sorted = [...ratings.values()].sort((a, b) => b.rating - a.rating);
    return NextResponse.json({
      success: true,
      season,
      config,
      ratings: sorted,
      adjustments: [...adjustments].reverse(), // newest first, full season ledger
      totalAdjustments: adjustments.length,
      unlinedGames,
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
