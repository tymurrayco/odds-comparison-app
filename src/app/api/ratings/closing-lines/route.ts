// src/app/api/ratings/closing-lines/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date'); // YYYY-MM-DD format (in US Eastern) - optional
  
  try {
    // Build date range for query
    let startOfRange: Date | null = null;
    let endOfRange: Date | null = null;
    
    if (date) {
      const [year, month, day] = date.split('-').map(Number);
      // For Eastern date, convert to UTC range
      // Eastern noon = UTC 17:00, Eastern midnight = UTC 05:00 next day
      startOfRange = new Date(Date.UTC(year, month - 1, day, 5, 0, 0)); // 5am UTC = midnight Eastern
      endOfRange = new Date(Date.UTC(year, month - 1, day + 1, 8, 0, 0)); // 8am UTC next day = 3am Eastern
      
      console.log(`[ClosingLines] Querying for date ${date}: ${startOfRange.toISOString()} to ${endOfRange.toISOString()}`);
    }
    
    // Query primary table: closing_lines (real-time cached)
    let primaryQuery = supabase
      .from('closing_lines')
      .select('*')
      .order('commence_time', { ascending: true });
    
    if (startOfRange && endOfRange) {
      primaryQuery = primaryQuery
        .gte('commence_time', startOfRange.toISOString())
        .lt('commence_time', endOfRange.toISOString());
    }
    
    const { data: primaryData, error: primaryError } = await primaryQuery;
    
    if (primaryError) {
      console.error('[ClosingLines] Primary table error:', primaryError);
    }
    
    // Query fallback table: ncaab_closing_lines (historical/sync data)
    let fallbackQuery = supabase
      .from('ncaab_closing_lines')
      .select('*')
      .order('game_date', { ascending: true });
    
    if (startOfRange && endOfRange) {
      fallbackQuery = fallbackQuery
        .gte('game_date', startOfRange.toISOString())
        .lt('game_date', endOfRange.toISOString());
    }
    
    const { data: fallbackData, error: fallbackError } = await fallbackQuery;
    
    if (fallbackError) {
      console.error('[ClosingLines] Fallback table error:', fallbackError);
    }
    
    // Combine results - primary table takes precedence
    const seenMatchups = new Set<string>();
    const closingLines: Array<{
      gameId: string;
      commenceTime: string | null;
      homeTeam: string;
      awayTeam: string;
      closingSpread: number | null;
      openingSpread: number | null;
      total: number | null;
      closingSource: string;
      source: string;
    }> = [];
    
    // Add from primary table first
    if (primaryData) {
      for (const row of primaryData) {
        if (row.home_team && row.away_team) {
          const matchupKey = `${row.home_team.toLowerCase()}|${row.away_team.toLowerCase()}`;
          seenMatchups.add(matchupKey);
          closingLines.push({
            gameId: row.game_id,
            commenceTime: row.commence_time,
            homeTeam: row.home_team,
            awayTeam: row.away_team,
            closingSpread: row.spread,
            openingSpread: row.opening_spread,
            total: row.total,
            closingSource: row.spread_bookmaker,
            source: 'closing_lines',
          });
        }
      }
    }
    
    // Add from fallback table if not already present
    if (fallbackData) {
      for (const row of fallbackData) {
        const matchupKey = `${row.home_team.toLowerCase()}|${row.away_team.toLowerCase()}`;
        if (!seenMatchups.has(matchupKey)) {
          seenMatchups.add(matchupKey);
          closingLines.push({
            gameId: row.game_id,
            commenceTime: row.game_date,
            homeTeam: row.home_team,
            awayTeam: row.away_team,
            closingSpread: row.closing_spread,
            openingSpread: null, // ncaab_closing_lines doesn't have opening spread
            total: null, // ncaab_closing_lines doesn't have total
            closingSource: row.closing_source,
            source: 'ncaab_closing_lines',
          });
        }
      }
    }
    
    console.log(`[ClosingLines] Found ${closingLines.length} closing lines (${primaryData?.length || 0} from primary, ${fallbackData?.length || 0} from fallback)`);
    
    return NextResponse.json({
      success: true,
      data: closingLines,
      count: closingLines.length,
    });
  } catch (error) {
    console.error('[ClosingLines] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch closing lines',
    }, { status: 500 });
  }
}
