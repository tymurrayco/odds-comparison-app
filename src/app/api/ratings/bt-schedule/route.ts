// src/app/api/ratings/bt-schedule/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { loadBTSchedule } from '@/lib/ratings/supabase';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') || undefined;

  try {
    const games = await loadBTSchedule(date);

    return NextResponse.json({
      success: true,
      data: games,
      count: games.length,
    });
  } catch (error) {
    console.error('BT Schedule load error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load BT schedule',
    }, { status: 500 });
  }
}
