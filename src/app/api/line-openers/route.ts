// src/app/api/line-openers/route.ts
//
// GET /api/line-openers?sport=americanfootball_nfl -> { [eventId]: { homeSpread, capturedAt } }
// Opening spreads for the game cards' line-move token (src/lib/lineOpeners.ts).

import { NextRequest, NextResponse } from 'next/server';
import { LINE_OPENER_SPORTS, loadLineOpeners } from '@/lib/lineOpeners';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const sport = request.nextUrl.searchParams.get('sport') ?? '';
  if (!LINE_OPENER_SPORTS.has(sport)) return NextResponse.json({});
  return NextResponse.json(await loadLineOpeners(sport));
}
