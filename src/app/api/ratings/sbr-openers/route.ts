// src/app/api/ratings/sbr-openers/route.ts
// Returns opening spreads for a given date from both sources:
// 1. ncaab_game_adjustments (KenPom names)
// 2. closing_lines synthetic SBR rows (KenPom or Odds API names)
// Serves as fallback for Schedule tab when Odds API doesn't have the game

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/ratings/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date'); // YYYY-MM-DD

  if (!date) {
    return NextResponse.json({ error: 'date parameter required' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseClient();

    const [year, month, day] = date.split('-').map(Number);
    const startOfDay = new Date(Date.UTC(year, month - 1, day, 3, 0, 0));   // 10 PM ET prior night
    const endOfDay = new Date(Date.UTC(year, month - 1, day + 1, 8, 0, 0)); // 3 AM ET next day

    // Fetch from both sources in parallel
    const [adjResult, clResult] = await Promise.all([
      supabase
        .from('ncaab_game_adjustments')
        .select('home_team, away_team, opening_spread')
        .gte('game_date', startOfDay.toISOString())
        .lt('game_date', endOfDay.toISOString())
        .not('opening_spread', 'is', null),
      supabase
        .from('closing_lines')
        .select('home_team, away_team, opening_spread')
        .gte('commence_time', startOfDay.toISOString())
        .lt('commence_time', endOfDay.toISOString())
        .not('opening_spread', 'is', null),
    ]);

    if (adjResult.error) {
      console.error('[SBR Openers GET] game_adjustments error:', adjResult.error);
    }
    if (clResult.error) {
      console.error('[SBR Openers GET] closing_lines error:', clResult.error);
    }

    // Deduplicate by "away|home" key (game_adjustments takes priority)
    const seen = new Set<string>();
    const openers: Array<{ homeTeam: string; awayTeam: string; openingSpread: number }> = [];

    for (const row of adjResult.data || []) {
      const key = `${row.away_team?.toLowerCase()}|${row.home_team?.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        openers.push({
          homeTeam: row.home_team,
          awayTeam: row.away_team,
          openingSpread: row.opening_spread,
        });
      }
    }

    for (const row of clResult.data || []) {
      if (!row.home_team || !row.away_team) continue;
      const key = `${row.away_team.toLowerCase()}|${row.home_team.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        openers.push({
          homeTeam: row.home_team,
          awayTeam: row.away_team,
          openingSpread: row.opening_spread,
        });
      }
    }

    return NextResponse.json({ success: true, openers });
  } catch (error) {
    console.error('[SBR Openers GET] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
