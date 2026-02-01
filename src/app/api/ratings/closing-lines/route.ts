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
    
    // Load team overrides for name normalization
    const { data: overridesData } = await supabase
      .from('ncaab_team_overrides')
      .select('source_name, kenpom_name, espn_name, odds_api_name, torvik_name');
    
    // Build maps from various name formats to canonical (kenpom) name
    const toCanonical = new Map<string, string>();
    if (overridesData) {
      for (const override of overridesData) {
        const canonical = override.kenpom_name.toLowerCase();
        
        // Map all variations to canonical name
        if (override.source_name) {
          toCanonical.set(override.source_name.toLowerCase(), canonical);
        }
        if (override.espn_name) {
          toCanonical.set(override.espn_name.toLowerCase(), canonical);
        }
        if (override.odds_api_name) {
          toCanonical.set(override.odds_api_name.toLowerCase(), canonical);
        }
        if (override.torvik_name) {
          toCanonical.set(override.torvik_name.toLowerCase(), canonical);
        }
        // Also map kenpom name to itself
        toCanonical.set(canonical, canonical);
      }
    }
    
    // Track unmatched names for debugging
    const unmatchedNames = new Set<string>();
    
    // Function to get canonical team name
    const getCanonicalName = (name: string): string => {
      const lower = name.toLowerCase();
      const canonical = toCanonical.get(lower);
      if (!canonical) {
        unmatchedNames.add(name);
      }
      return canonical || lower;
    };
    
    // Query primary table: closing_lines (real-time cached - has opening_spread but spread goes null when games start)
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
    
    // Query fallback table: ncaab_closing_lines (historical/sync data - has closing_spread but no opening_spread)
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
    
    // Build a map of fallback data by CANONICAL matchup key for merging
    const fallbackByMatchup = new Map<string, typeof fallbackData[0]>();
    if (fallbackData) {
      for (const row of fallbackData) {
        const canonicalHome = getCanonicalName(row.home_team);
        const canonicalAway = getCanonicalName(row.away_team);
        const matchupKey = `${canonicalHome}|${canonicalAway}`;
        fallbackByMatchup.set(matchupKey, row);
      }
    }
    
    // Debug: Log some fallback matchup keys
    console.log(`[ClosingLines] Sample fallback keys:`, Array.from(fallbackByMatchup.keys()).slice(0, 5));
    
    // Combine results - MERGE data from both tables using canonical names
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
    
    // Track games that need closing spread but didn't get one
    const missingClosingSpread: string[] = [];
    
    // Process primary table and merge with fallback where available
    if (primaryData) {
      for (const row of primaryData) {
        if (row.home_team && row.away_team) {
          // Use canonical names for matching
          const canonicalHome = getCanonicalName(row.home_team);
          const canonicalAway = getCanonicalName(row.away_team);
          const matchupKey = `${canonicalHome}|${canonicalAway}`;
          seenMatchups.add(matchupKey);
          
          // Check if fallback has closing spread for this game (using canonical matching)
          const fallbackRow = fallbackByMatchup.get(matchupKey);
          
          // Use spread from primary if available, otherwise use closing_spread from fallback
          const closingSpread = row.spread ?? (fallbackRow?.closing_spread ?? null);
          
          // Track games that needed a closing spread from fallback but didn't find one
          if (row.spread === null && !fallbackRow) {
            missingClosingSpread.push(`${row.away_team} @ ${row.home_team} (key: ${matchupKey})`);
          }
          
          closingLines.push({
            gameId: row.game_id,
            commenceTime: row.commence_time,
            homeTeam: row.home_team,
            awayTeam: row.away_team,
            closingSpread: closingSpread,
            openingSpread: row.opening_spread,
            total: row.total,
            closingSource: row.spread_bookmaker || fallbackRow?.closing_source || 'unknown',
            source: fallbackRow && row.spread === null ? 'merged' : 'closing_lines',
          });
        }
      }
    }
    
    // Add from fallback table any games not in primary (using canonical matching)
    if (fallbackData) {
      for (const row of fallbackData) {
        const canonicalHome = getCanonicalName(row.home_team);
        const canonicalAway = getCanonicalName(row.away_team);
        const matchupKey = `${canonicalHome}|${canonicalAway}`;
        
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
    
    const mergedCount = closingLines.filter(cl => cl.source === 'merged').length;
    const withClosingSpread = closingLines.filter(cl => cl.closingSpread !== null).length;
    const primaryNullSpread = primaryData?.filter(r => r.spread === null).length || 0;
    
    console.log(`[ClosingLines] Found ${closingLines.length} closing lines (${primaryData?.length || 0} from primary, ${fallbackData?.length || 0} from fallback, ${mergedCount} merged, ${withClosingSpread} with closing spread, ${overridesData?.length || 0} overrides loaded)`);
    console.log(`[ClosingLines] Primary games with null spread: ${primaryNullSpread}`);
    console.log(`[ClosingLines] Unmatched team names (not in overrides):`, Array.from(unmatchedNames).slice(0, 20));
    console.log(`[ClosingLines] Games missing closing spread (first 10):`, missingClosingSpread.slice(0, 10));
    
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
