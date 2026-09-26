// src/app/api/line-openers/capture/route.ts
//
// GET /api/line-openers/capture — daily cron (vercel.json). /api/odds already
// records openers whenever someone loads a football board; this catches games
// posted while nobody is looking. Spreads only: 1 credit per sport.

import { NextResponse } from 'next/server';
import { ODDS_API_BOOKMAKERS } from '@/lib/api';
import { recordCreditSnapshot } from '@/lib/creditUsage';
import { captureLineOpeners, LINE_OPENER_SPORTS } from '@/lib/lineOpeners';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return NextResponse.json({ success: false, error: 'ODDS_API_KEY missing' }, { status: 500 });
  const report: Record<string, number | string> = {};
  for (const sport of LINE_OPENER_SPORTS) {
    try {
      const res = await fetch(
        `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${apiKey}&bookmakers=${ODDS_API_BOOKMAKERS.join(',')}&markets=spreads&oddsFormat=american`,
        { cache: 'no-store' }
      );
      if (!res.ok) { report[sport] = `HTTP ${res.status}`; continue; }
      await recordCreditSnapshot(res.headers.get('x-requests-remaining'), res.headers.get('x-requests-used'), 'line-openers');
      report[sport] = await captureLineOpeners(sport, await res.json(), true);
    } catch (e) {
      report[sport] = e instanceof Error ? e.message : String(e);
    }
  }
  return NextResponse.json({ success: true, offered: report });
}
