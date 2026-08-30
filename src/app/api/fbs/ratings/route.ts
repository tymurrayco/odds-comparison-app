// src/app/api/fbs/ratings/route.ts

/**
 * GET /api/fbs/ratings?season=2026
 * Ratings table + config + recent adjustments for the admin page.
 */

import { NextRequest, NextResponse } from 'next/server';
import { FBS_SEASON } from '@/lib/fbs/constants';
import {
  loadFbsAdjustments,
  loadFbsConfig,
  loadFbsManualAdjustments,
  loadFbsRatings,
  loadUnlinedFbsGames,
} from '@/lib/fbs/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const seasonParam = request.nextUrl.searchParams.get('season');
    const season = seasonParam ? parseInt(seasonParam, 10) : FBS_SEASON;

    const [ratings, config, adjustments, unlinedGames, manualAdjustments] =
      await Promise.all([
        loadFbsRatings(season),
        loadFbsConfig(),
        loadFbsAdjustments(season),
        loadUnlinedFbsGames(),
        loadFbsManualAdjustments(season),
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
      manualAdjustments: [...manualAdjustments].reverse(), // newest first
      pendingManualCount: manualAdjustments.filter((m) => m.pending).length,
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
