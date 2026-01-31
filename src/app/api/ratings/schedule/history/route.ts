// src/app/api/ratings/schedule/history/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Force dynamic rendering
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
  btSpread: number | null;
  total: number | null;
  spreadBookmaker: string | null;
  isToday: boolean;
  isTomorrow: boolean;
  hasStarted: boolean;
  isFrozen: boolean;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '1000');
    const offset = parseInt(searchParams.get('offset') || '0');
    
    // Use raw SQL to join the tables properly - this works in Supabase
    const { data, error } = await supabase.rpc('get_history_with_bt', {
      p_limit: limit,
      p_offset: offset
    });
    
    if (error) {
      console.error('[History] RPC error, falling back to separate queries:', error);
      // Fallback to separate queries
      return await fallbackQuery(limit, offset);
    }
    
    const games: HistoryGame[] = (data || []).map((row: {
      game_id: string;
      game_date: string;
      home_team: string;
      away_team: string;
      closing_spread: number | null;
      opening_spread: number | null;
      projected_spread: number | null;
      bt_spread: number | null;
      closing_source: string | null;
    }) => ({
      id: row.game_id,
      commenceTime: row.game_date,
      homeTeam: row.home_team,
      awayTeam: row.away_team,
      spread: row.closing_spread,
      openingSpread: row.opening_spread,
      projectedSpread: row.projected_spread,
      btSpread: row.bt_spread,
      total: null,
      spreadBookmaker: row.closing_source,
      isToday: false,
      isTomorrow: false,
      hasStarted: true,
      isFrozen: true,
    }));
    
    const btMatchCount = games.filter(g => g.btSpread !== null).length;
    console.log(`[History] Returning ${games.length} games, BT matches: ${btMatchCount}`);
    
    return NextResponse.json({
      success: true,
      games,
      count: games.length,
      offset,
      limit,
      btMatchCount,
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

// Fallback if RPC doesn't exist
async function fallbackQuery(limit: number, offset: number) {
  const { data: adjustments, error } = await supabase
    .from('ncaab_game_adjustments')
    .select('*')
    .order('game_date', { ascending: false })
    .range(offset, offset + limit - 1);
  
  if (error) {
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
  
  const games: HistoryGame[] = (adjustments || [])
    .filter(adj => adj.home_team && adj.away_team)
    .map(adj => ({
      id: adj.game_id,
      commenceTime: adj.game_date,
      homeTeam: adj.home_team,
      awayTeam: adj.away_team,
      spread: adj.closing_spread,
      openingSpread: adj.opening_spread ?? null,
      projectedSpread: adj.projected_spread,
      btSpread: null, // No BT data in fallback
      total: null,
      spreadBookmaker: adj.closing_source,
      isToday: false,
      isTomorrow: false,
      hasStarted: true,
      isFrozen: true,
    }));
  
  console.log(`[History] Fallback: Returning ${games.length} games (no BT data)`);
  
  return NextResponse.json({
    success: true,
    games,
    count: games.length,
    offset,
    limit,
    btMatchCount: 0,
  });
}
