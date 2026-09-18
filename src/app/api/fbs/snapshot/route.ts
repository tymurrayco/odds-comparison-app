// src/app/api/fbs/snapshot/route.ts
//
// GET /api/fbs/snapshot[?season=][&force=1]
// Capture this week's FBS futures / G5 / national-title market rows into
// fbs_futures_snapshots (src/lib/fbs/snapshots.ts). The Vercel cron calls
// this daily (vercel.json); it writes only when the current completed week
// has no rows yet, so the table holds one snapshot per week. `force=1`
// (the admin "Snapshot now" button) rewrites this week's rows.

import { NextRequest, NextResponse } from 'next/server';
import { FBS_SEASON } from '@/lib/fbs/constants';
import { takeSnapshot } from '@/lib/fbs/snapshots';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const month = new Date().getUTCMonth() + 1;
  if (month >= 2 && month <= 7) {
    return NextResponse.json({ skipped: true, reason: 'off-season (Feb-Jul)' });
  }
  try {
    const season = Number(request.nextUrl.searchParams.get('season')) || FBS_SEASON;
    const force = request.nextUrl.searchParams.get('force') === '1';
    const report = await takeSnapshot(season, force);
    return NextResponse.json({ success: true, ...report });
  } catch (e) {
    console.error('[FBS snapshot]', e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
