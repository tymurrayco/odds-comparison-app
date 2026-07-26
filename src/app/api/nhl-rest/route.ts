// src/app/api/nhl-rest/route.ts
import { NextResponse } from 'next/server';
import { getNHLRestData, nhlToday } from '@/lib/nhlRestData';

export async function GET() {
  const games = await getNHLRestData();
  return NextResponse.json({ date: nhlToday(), games });
}
