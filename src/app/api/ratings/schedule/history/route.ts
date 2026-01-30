// src/app/api/ratings/schedule/history/route.ts

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Force dynamic rendering
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * History API Route
 * 
 * Fetches historical games with closing lines from Supabase.
 * Uses ncaab_game_adjustments which has projected spreads and opening spreads.
 */

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface HistoryGame {
  id: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  spread: number | null;
  openingSpread: number | null;
  projectedSpread: number | null;
  total: number | null;
  spreadBookmaker: string | null;
  isToday: boolean;
  isTomorrow: boolean;
  hasStarted: boolean;
  isFrozen: boolean;
}

export async function GET() {
  try {
    // Fetch game adjustments which have projected spread, closing spread, opening spread, and team names
    const { data: adjustments, error } = await supabase
      .from('ncaab_game_adjustments')
      .select('*')
      .order('game_date', { ascending: false })
      .limit(5000);
    
    if (error) {
      console.error('[History] Supabase error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch history' },
        { status: 500 }
      );
    }
    
    if (!adjustments || adjustments.length === 0) {
      return NextResponse.json({
        success: true,
        games: [],
        count: 0,
      });
    }
    
    // Convert to HistoryGame format
    const games: HistoryGame[] = adjustments
      .filter(adj => adj.home_team && adj.away_team)
      .map(adj => ({
        id: adj.game_id,
        commenceTime: adj.game_date,
        homeTeam: adj.home_team,
        awayTeam: adj.away_team,
        spread: adj.closing_spread,
        openingSpread: adj.opening_spread ?? null,
        projectedSpread: adj.projected_spread,
        total: null, // ncaab_game_adjustments doesn't have totals
        spreadBookmaker: adj.closing_source,
        isToday: false,
        isTomorrow: false,
        hasStarted: true,
        isFrozen: true,
      }));
    
    console.log(`[History] Returning ${games.length} historical games from game_adjustments`);
    
    return NextResponse.json({
      success: true,
      games,
      count: games.length,
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      }
    });
    
  } catch (error) {
    console.error('[History] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch history' },
      { status: 500 }
    );
  }
}
