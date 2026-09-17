// src/app/api/novig-odds/route.ts
// Direct Novig prices for the board (see src/lib/novig.ts). Same contract as
// /api/kalshi-odds: never throws to the client — an empty list means "no
// direct feed", and the Odds API's Novig relay (if present) stays as fallback.
import { NextResponse } from 'next/server';
import { fetchNovigOdds } from '@/lib/novig';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sport = searchParams.get('sport');
  if (!sport) return NextResponse.json({ games: [] });

  try {
    const games = await fetchNovigOdds(sport);
    return NextResponse.json({ games });
  } catch (error) {
    console.error('Error fetching Novig odds:', error);
    return NextResponse.json({ games: [] });
  }
}
