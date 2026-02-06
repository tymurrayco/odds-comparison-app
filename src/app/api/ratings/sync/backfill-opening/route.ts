// src/app/api/ratings/sync/backfill-opening/route.ts
// DISABLED — SBR openers are now the single source of truth for opening lines.
// POST endpoint returns 410. GET endpoint still works for checking which dates need openers.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Backfill Opening Lines API — DISABLED
 * 
 * SBR openers are now the single source of truth for opening lines.
 * Use the SBR Openers tab to save opening lines instead.
 */
export async function POST() {
  return NextResponse.json({
    success: false,
    message: 'Disabled — SBR openers are now the source of truth. Use the SBR Openers tab to save opening lines.',
  }, { status: 410 });
}

/**
 * GET endpoint to see which dates need backfilling
 * Still useful for checking which past dates need SBR openers saved.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  
  if (!date) {
    // Show dates with games missing opening spreads
    const { data, error } = await supabase
      .from('ncaab_game_adjustments')
      .select('game_date')
      .is('opening_spread', null)
      .order('game_date', { ascending: true });
    
    if (error) {
      return NextResponse.json({ success: false, error: error.message });
    }
    
    // Group by date
    const dateGroups: Record<string, number> = {};
    for (const row of data || []) {
      const d = row.game_date.split('T')[0];
      dateGroups[d] = (dateGroups[d] || 0) + 1;
    }
    
    return NextResponse.json({
      success: true,
      message: 'Games needing opening spreads by date. Use SBR Openers tab to save them.',
      dates: Object.entries(dateGroups).map(([date, count]) => ({ date, count })),
      totalGames: data?.length || 0,
    });
  }
  
  // Show specific date info
  const startOfDay = `${date}T00:00:00Z`;
  const endOfDay = `${date}T23:59:59Z`;
  
  const { data, error } = await supabase
    .from('ncaab_game_adjustments')
    .select('home_team, away_team, game_date, opening_spread, closing_spread')
    .gte('game_date', startOfDay)
    .lte('game_date', endOfDay)
    .order('game_date');

  if (error) {
    return NextResponse.json({ success: false, error: error.message });
  }

  return NextResponse.json({
    success: true,
    date,
    games: data || [],
    total: data?.length || 0,
    needingOpening: (data || []).filter(g => g.opening_spread === null).length,
    haveOpening: (data || []).filter(g => g.opening_spread !== null).length,
  });
}
