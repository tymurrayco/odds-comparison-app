// src/app/api/nfl/snapshot/route.ts
//
// GET /api/nfl/snapshot[?season=][&force=1]
// Capture this week's NFL futures rows and the books' Super Bowl outrights
// into nfl_futures_snapshots (src/lib/nfl/snapshots.ts). Called daily by
// the Vercel cron (vercel.json); writes only when the current completed
// week has no rows yet. `force=1` (admin "Snapshot now") rewrites it.

import { NextRequest, NextResponse } from 'next/server';
import { NFL_SEASON } from '@/lib/nfl/constants';
import { takeNflSnapshot } from '@/lib/nfl/snapshots';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const month = new Date().getUTCMonth() + 1;
  if (month >= 3 && month <= 7) {
    return NextResponse.json({ skipped: true, reason: 'off-season (Mar-Jul)' });
  }
  try {
    const season = Number(request.nextUrl.searchParams.get('season')) || NFL_SEASON;
    const force = request.nextUrl.searchParams.get('force') === '1';
    const report = await takeNflSnapshot(season, force);
    return NextResponse.json({ success: true, ...report });
  } catch (e) {
    console.error('[NFL snapshot]', e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
