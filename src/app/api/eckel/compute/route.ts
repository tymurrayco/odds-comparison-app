// src/app/api/eckel/compute/route.ts
//
// POST /api/eckel/compute?year=2025[&week=8]
// Fetches the season from CFBD, computes the Eckel snapshot, stores it in
// Supabase (eckel_snapshots), and returns a summary + validation warnings.

import { NextRequest, NextResponse } from 'next/server';
import { runEckelCompute } from '@/lib/eckel/run';
export const dynamic = 'force-dynamic';

export const maxDuration = 60; // full-season fetch + ridge fit

export async function POST(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const year = parseInt(params.get('year') || '') || new Date().getFullYear();
    const weekRaw = params.get('week');
    const week = weekRaw ? parseInt(weekRaw) : null;

    const { snapshot, storeError } = await runEckelCompute(year, week);
    if (storeError) {
      return NextResponse.json(
        { error: `Computed but failed to store: ${storeError}`, validation: snapshot.validation },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      season: year,
      week,
      teams: snapshot.teams.length,
      games: snapshot.meta.games,
      drives: snapshot.meta.drives,
      garbageDrivesExcluded: snapshot.meta.garbageDrivesExcluded,
      hfaPoints: snapshot.meta.hfaPoints,
      validation: snapshot.validation,
      top10: snapshot.teams.slice(0, 10).map((t) => ({
        team: t.team,
        power: t.powerRating,
        record: `${t.wins}-${t.losses}`,
        xWins: t.xWins,
      })),
    });
  } catch (error) {
    console.error('[Eckel Compute] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Compute failed' },
      { status: 500 }
    );
  }
}
