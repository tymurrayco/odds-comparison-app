// src/app/api/eckel/cron/route.ts
//
// Weekly in-season Eckel recompute (Vercel cron sends GET — see vercel.json:
// Sundays 10:00 UTC, after Saturday's games land in CFBD overnight).
// Off-season months (Feb-Jul) no-op so the finished season's snapshot stays
// the latest without burning CFBD calls.

import { NextResponse } from 'next/server';
import { runEckelCompute } from '@/lib/eckel/run';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  const now = new Date();
  const month = now.getUTCMonth() + 1; // 1-12
  if (month >= 2 && month <= 7) {
    return NextResponse.json({ skipped: true, reason: 'off-season (Feb-Jul)' });
  }
  // Jan runs belong to the season that started the previous fall.
  const seasonYear = month === 1 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  try {
    const { snapshot, storeError } = await runEckelCompute(seasonYear, null);
    return NextResponse.json({
      success: !storeError,
      season: seasonYear,
      teams: snapshot.teams.length,
      games: snapshot.meta.games,
      validation: snapshot.validation,
      storeError,
    });
  } catch (error) {
    console.error('[Eckel Cron] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Cron compute failed' },
      { status: 500 }
    );
  }
}
