// src/app/api/kickoffs/route.ts
//
// GET /api/kickoffs?league=NFL   (league as bets store it: NFL, NCAAF, NBA, ...)
//   → { games: [{ home, away, commence }] } — start times of that league's
//     upcoming and in-progress games.
// A bet stores the day of its game, not the hour; the Bets view uses this to
// order pending bets by kickoff. Public and read-only. The source is the Odds
// API "events" list, which costs no credits (src/lib/server/leagueOrder.ts).

import { NextRequest, NextResponse } from 'next/server';
import { LEAGUES } from '@/lib/api';
import { leagueEvents } from '@/lib/server/leagueOrder';

export async function GET(req: NextRequest) {
  const name = (req.nextUrl.searchParams.get('league') ?? '').toUpperCase();
  const league = LEAGUES.find((l) => l.isActive && l.name.toUpperCase() === name);
  if (!league) return NextResponse.json({ games: [] });

  const events = await leagueEvents(league.id);
  return NextResponse.json(
    { games: events.map((e) => ({ home: e.home_team, away: e.away_team, commence: e.commence_time })) },
    { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800' } }
  );
}
