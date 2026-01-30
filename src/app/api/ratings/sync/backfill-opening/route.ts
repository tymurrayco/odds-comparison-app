// src/app/api/ratings/sync/backfill-opening/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const ODDS_API_BASE_URL = 'https://api.the-odds-api.com/v4';
const NCAAB_SPORT_KEY = 'basketball_ncaab';

interface OddsAPIGame {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Array<{
    key: string;
    title: string;
    markets: Array<{
      key: string;
      outcomes: Array<{
        name: string;
        price: number;
        point?: number;
      }>;
    }>;
  }>;
}

/**
 * Backfill Opening Lines API
 * 
 * Fetches historical opening odds for a specific date and stores them.
 * 
 * POST /api/ratings/sync/backfill-opening
 * Body: { date: "2026-01-15" }  // YYYY-MM-DD format (Eastern time)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date } = body;
    
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid date format. Use YYYY-MM-DD',
      }, { status: 400 });
    }
    
    const oddsApiKey = process.env.ODDS_API_KEY;
    if (!oddsApiKey) {
      return NextResponse.json({
        success: false,
        error: 'Odds API key not configured',
      }, { status: 500 });
    }
    
    console.log(`[Backfill] Starting backfill for date: ${date}`);
    
    // Parse date and create opening timestamp
    // Opening time: ~10am Eastern = 15:00 UTC (EST) or 14:00 UTC (EDT)
    const [year, month, day] = date.split('-').map(Number);
    const openingTime = new Date(Date.UTC(year, month - 1, day, 15, 0, 0));
    const openingTimeStr = openingTime.toISOString().replace('.000Z', 'Z');
    
    console.log(`[Backfill] Fetching opening odds at: ${openingTimeStr}`);
    
    // Fetch opening odds
    const openingGames = await fetchOddsForTimestamp(oddsApiKey, openingTimeStr);
    console.log(`[Backfill] Found ${openingGames.length} games with odds`);
    
    // Filter to games on target date and store
    let gamesProcessed = 0;
    let gamesSkipped = 0;
    let gamesUpdated = 0;
    let gamesInserted = 0;
    
    for (const game of openingGames) {
      const spread = extractSpread(game);
      if (spread === null) {
        gamesSkipped++;
        continue;
      }
      
      // Check if game is on the target date
      const gameDate = new Date(game.commence_time);
      const gameDateStr = gameDate.toISOString().split('T')[0];
      const nextDateStr = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().split('T')[0];
      
      // Allow games from target date or next day (for late night Eastern games stored as next day UTC)
      if (gameDateStr !== date && gameDateStr !== nextDateStr) {
        continue;
      }
      
      // Check if record already exists
      const { data: existing } = await supabase
        .from('closing_lines')
        .select('game_id, home_team, away_team, commence_time, opening_spread')
        .eq('game_id', game.id)
        .single();
      
      if (existing) {
        // Record exists - only update null fields
        const updates: Record<string, string | number> = {};
        
        if (existing.home_team === null) {
          updates.home_team = game.home_team;
        }
        if (existing.away_team === null) {
          updates.away_team = game.away_team;
        }
        if (existing.commence_time === null) {
          updates.commence_time = game.commence_time;
        }
        if (existing.opening_spread === null) {
          updates.opening_spread = spread.spread;
        }
        
        // Only update if there's something to update
        if (Object.keys(updates).length > 0) {
          const { error } = await supabase
            .from('closing_lines')
            .update(updates)
            .eq('game_id', game.id);
          
          if (!error) {
            gamesUpdated++;
            gamesProcessed++;
          } else {
            console.error(`[Backfill] Error updating ${game.id}:`, error);
            gamesSkipped++;
          }
        } else {
          gamesSkipped++; // Nothing to update
        }
      } else {
        // Record doesn't exist - insert everything
        const { error } = await supabase
          .from('closing_lines')
          .insert({
            game_id: game.id,
            home_team: game.home_team,
            away_team: game.away_team,
            commence_time: game.commence_time,
            opening_spread: spread.spread,
            spread_bookmaker: spread.bookmaker,
            frozen_at: openingTime.toISOString(),
            created_at: new Date().toISOString(),
          });
        
        if (!error) {
          gamesInserted++;
          gamesProcessed++;
        } else {
          console.error(`[Backfill] Error inserting ${game.id}:`, error);
          gamesSkipped++;
        }
      }
    }
    
    console.log(`[Backfill] Complete: ${gamesProcessed} games processed (${gamesUpdated} updated, ${gamesInserted} inserted), ${gamesSkipped} skipped`);
    
    return NextResponse.json({
      success: true,
      date,
      gamesProcessed,
      gamesUpdated,
      gamesInserted,
      gamesSkipped,
      totalGamesFound: openingGames.length,
      message: `Backfilled ${gamesProcessed} games (${gamesUpdated} updated, ${gamesInserted} inserted). Run the SQL UPDATE to copy opening_spread to ncaab_game_adjustments.`,
    });
    
  } catch {
    console.error('[Backfill] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * Fetch odds for a specific timestamp from Odds API
 */
async function fetchOddsForTimestamp(apiKey: string, timestamp: string): Promise<OddsAPIGame[]> {
  const allGames: OddsAPIGame[] = [];
  
  // Try Pinnacle first (best source for opening lines)
  try {
    const pinnacleUrl = `${ODDS_API_BASE_URL}/historical/sports/${NCAAB_SPORT_KEY}/odds?` +
      `apiKey=${apiKey}&regions=eu&markets=spreads&oddsFormat=american` +
      `&date=${timestamp}&bookmakers=pinnacle`;
    
    console.log(`[Backfill] Fetching Pinnacle odds...`);
    const response = await fetch(pinnacleUrl);
    if (response.ok) {
      const data = await response.json();
      console.log(`[Backfill] Remaining API requests: ${data.requests_remaining}`);
      if (data.data && Array.isArray(data.data)) {
        allGames.push(...data.data);
      }
    } else {
      console.error(`[Backfill] Pinnacle fetch failed: ${response.status}`);
    }
  } catch (err) {
    console.error('[Backfill] Pinnacle fetch error:', err);
  }
  
  // Also try US books for games Pinnacle might not have
  try {
    const usUrl = `${ODDS_API_BASE_URL}/historical/sports/${NCAAB_SPORT_KEY}/odds?` +
      `apiKey=${apiKey}&regions=us&markets=spreads&oddsFormat=american` +
      `&date=${timestamp}&bookmakers=draftkings,fanduel`;
    
    console.log(`[Backfill] Fetching US books odds...`);
    const response = await fetch(usUrl);
    if (response.ok) {
      const data = await response.json();
      console.log(`[Backfill] Remaining API requests: ${data.requests_remaining}`);
      if (data.data && Array.isArray(data.data)) {
        const existingIds = new Set(allGames.map(g => g.id));
        for (const game of data.data) {
          if (!existingIds.has(game.id)) {
            allGames.push(game);
          }
        }
      }
    }
  } catch (err) {
    console.error('[Backfill] US books fetch error:', err);
  }
  
  return allGames;
}

/**
 * Extract spread from an Odds API game
 */
function extractSpread(game: OddsAPIGame): { spread: number; bookmaker: string } | null {
  // Try Pinnacle first
  const pinnacle = game.bookmakers.find(b => b.key === 'pinnacle');
  if (pinnacle) {
    const spreadsMarket = pinnacle.markets.find(m => m.key === 'spreads');
    if (spreadsMarket) {
      const homeOutcome = spreadsMarket.outcomes.find(o => o.name === game.home_team);
      if (homeOutcome?.point !== undefined) {
        return { spread: homeOutcome.point, bookmaker: 'pinnacle' };
      }
    }
  }
  
  // Fall back to US books
  for (const bookKey of ['draftkings', 'fanduel', 'betmgm']) {
    const book = game.bookmakers.find(b => b.key === bookKey);
    if (book) {
      const spreadsMarket = book.markets.find(m => m.key === 'spreads');
      if (spreadsMarket) {
        const homeOutcome = spreadsMarket.outcomes.find(o => o.name === game.home_team);
        if (homeOutcome?.point !== undefined) {
          return { spread: homeOutcome.point, bookmaker: bookKey };
        }
      }
    }
  }
  
  return null;
}

/**
 * GET endpoint to see which dates need backfilling
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
      message: 'Games needing opening spreads by date. POST with { date: "YYYY-MM-DD" } to backfill.',
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
  
  return NextResponse.json({
    success: true,
    date,
    games: data || [],
    total: data?.length || 0,
    needingOpening: (data || []).filter(g => g.opening_spread === null).length,
    haveOpening: (data || []).filter(g => g.opening_spread !== null).length,
  });
}
