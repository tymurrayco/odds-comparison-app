// src/app/api/kalshi-odds/route.ts
import { NextResponse } from 'next/server';
import { fetchKalshiOdds } from '@/lib/kalshi';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sport = searchParams.get('sport');

  if (!sport) {
    return NextResponse.json({ moneyline: [], spreads: [] });
  }

  try {
    const result = await fetchKalshiOdds(sport);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching Kalshi odds:', error);
    return NextResponse.json({ moneyline: [], spreads: [] });
  }
}
