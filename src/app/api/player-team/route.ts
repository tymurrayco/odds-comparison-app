// src/app/api/player-team/route.ts
// GET /api/player-team?league=<sport key or display name>&player=<name>&teams=<Away>,<Home>
// -> { team: "<one of the given names>" | null }. Backs prop-bet logging so
// the bet carries the player's team (badge accent + share-page theme).

import { NextRequest, NextResponse } from 'next/server';
import { resolvePlayerTeam } from '@/lib/playerTeam';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const league = request.nextUrl.searchParams.get('league') ?? '';
  const player = request.nextUrl.searchParams.get('player') ?? '';
  const teams = (request.nextUrl.searchParams.get('teams') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!league || !player || teams.length === 0) {
    return NextResponse.json({ success: false, error: 'league, player and teams are required' }, { status: 400 });
  }
  try {
    const team = await resolvePlayerTeam(league, player, teams);
    return NextResponse.json(
      { success: true, team },
      { headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' } }
    );
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
