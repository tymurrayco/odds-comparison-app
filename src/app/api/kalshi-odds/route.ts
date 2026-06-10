// src/app/api/kalshi-odds/route.ts
import { NextResponse } from 'next/server';
import { fetchKalshiOdds, fetchKalshiFutures } from '@/lib/kalshi';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sport = searchParams.get('sport');

  // Futures mode: championship winner prices, one per team
  if (searchParams.get('futures') === 'true') {
    if (!sport) {
      return NextResponse.json({ futures: [] });
    }
    try {
      const futures = await fetchKalshiFutures(sport);
      return NextResponse.json({ futures });
    } catch (error) {
      console.error('Error fetching Kalshi futures:', error);
      return NextResponse.json({ futures: [] });
    }
  }

  if (!sport) {
    return NextResponse.json({ moneyline: [], spreads: [], totals: [] });
  }

  try {
    const result = await fetchKalshiOdds(sport);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching Kalshi odds:', error);
    return NextResponse.json({ moneyline: [], spreads: [], totals: [] });
  }
}
