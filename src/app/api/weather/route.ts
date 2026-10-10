// src/app/api/weather/route.ts
//
// GET /api/weather?league=<sport_key>
//   → { games: GameWeather[] } — game-time weather for this week's outdoor
//     NFL / college football / MLB / CFL games (src/lib/weather.ts). Each game carries
//     `flags`; the card shows an icon only when that list isn't empty.
// Public and read-only. Cached at the edge for 10 minutes; the forecasts
// behind it refresh every 30.

import { NextRequest, NextResponse } from 'next/server';
import { gameWeather, WEATHER_SPORTS } from '@/lib/weather';

export const maxDuration = 60; // a cold start reads ~80 venues from two forecast services

export async function GET(req: NextRequest) {
  const league = req.nextUrl.searchParams.get('league') ?? '';
  if (!WEATHER_SPORTS.has(league)) {
    return NextResponse.json({ games: [] });
  }
  try {
    const games = await gameWeather(league);
    return NextResponse.json(
      { games },
      { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800' } }
    );
  } catch (e) {
    console.error('[weather]', e);
    return NextResponse.json({ games: [] });
  }
}
