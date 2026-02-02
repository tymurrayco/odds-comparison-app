// src/app/api/ratings/sync/backfill-closing/route.ts

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
 * Backfill Closing Lines API
 * 
 * Re-fetches historical closing odds for a specific date and updates the closing_lines table.
 * Use this when closing lines were captured incorrectly (e.g., during API outage).
 * 
 * POST /api/ratings/sync/backfill-closing
 * Body: { "date": "2026-01-31" }  // YYYY-MM-DD format (Eastern time)
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
    
    console.log(`[Backfill Closing] Starting backfill for date: ${date}`);
    
    // Parse date and create time range (Eastern time -> UTC)
    const [year, month, day] = date.split('-').map(Number);
    const startOfDay = new Date(Date.UTC(year, month - 1, day, 5, 0, 0)); // 5 AM UTC = midnight ET
    const endOfDay = new Date(Date.UTC(year, month - 1, day + 1, 8, 0, 0)); // 8 AM UTC next day
    
    // Get all games from closing_lines for this date
    const { data: existingGames, error: fetchError } = await supabase
      .from('closing_lines')
      .select('game_id, home_team, away_team, commence_time, spread, spread_bookmaker')
      .gte('commence_time', startOfDay.toISOString())
      .lt('commence_time', endOfDay.toISOString());
    
    if (fetchError) {
      console.error('[Backfill Closing] Error fetching existing games:', fetchError);
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch existing games',
      }, { status: 500 });
    }
    
    if (!existingGames || existingGames.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No games found for this date',
        date,
        gamesFound: 0,
      });
    }
    
    console.log(`[Backfill Closing] Found ${existingGames.length} games to re-fetch`);
    
    let gamesUpdated = 0;
    let gamesSkipped = 0;
    let gamesFailed = 0;
    const updates: Array<{ gameId: string; oldSpread: number | null; newSpread: number | null; bookmaker: string | null }> = [];
    
    // Process each game
    for (const game of existingGames) {
      if (!game.commence_time) {
        gamesSkipped++;
        continue;
      }
      
      const gameStart = new Date(game.commence_time);
      const freezeTime = new Date(gameStart.getTime() - 5 * 60 * 1000); // 5 min before tipoff
      const freezeTimeISO = freezeTime.toISOString().replace(/\.\d{3}Z$/, 'Z');
      
      try {
        // Fetch historical odds for this specific game
        const result = await fetchClosingLine(oddsApiKey, game.game_id, freezeTimeISO, game.home_team);
        
        if (result) {
          // Update the closing_lines table
          const { error: updateError } = await supabase
            .from('closing_lines')
            .update({
              spread: result.spread,
              spread_bookmaker: result.bookmaker,
              frozen_at: freezeTime.toISOString(),
            })
            .eq('game_id', game.game_id);
          
          if (updateError) {
            console.error(`[Backfill Closing] Failed to update ${game.game_id}:`, updateError);
            gamesFailed++;
          } else {
            gamesUpdated++;
            updates.push({
              gameId: game.game_id,
              oldSpread: game.spread,
              newSpread: result.spread,
              bookmaker: result.bookmaker,
            });
            console.log(`[Backfill Closing] Updated ${game.away_team} @ ${game.home_team}: ${game.spread} -> ${result.spread} (${result.bookmaker})`);
          }
        } else {
          gamesSkipped++;
          console.log(`[Backfill Closing] No odds found for ${game.away_team} @ ${game.home_team}`);
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (err) {
        console.error(`[Backfill Closing] Error processing ${game.game_id}:`, err);
        gamesFailed++;
      }
    }
    
    console.log(`[Backfill Closing] Complete: ${gamesUpdated} updated, ${gamesSkipped} skipped, ${gamesFailed} failed`);
    
    return NextResponse.json({
      success: true,
      date,
      gamesFound: existingGames.length,
      gamesUpdated,
      gamesSkipped,
      gamesFailed,
      updates: updates.slice(0, 20), // Return first 20 updates for review
    });
    
  } catch (error) {
    console.error('[Backfill Closing] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * Fetch closing line for a specific game from Odds API historical endpoint
 */
async function fetchClosingLine(
  apiKey: string,
  gameId: string,
  timestamp: string,
  homeTeam: string
): Promise<{ spread: number; bookmaker: string } | null> {
  
  // Try with Pinnacle first
  try {
    const pinnacleUrl = `${ODDS_API_BASE_URL}/historical/sports/${NCAAB_SPORT_KEY}/odds?` +
      `apiKey=${apiKey}&regions=eu&markets=spreads&oddsFormat=american` +
      `&date=${timestamp}&eventIds=${gameId}&bookmakers=pinnacle`;
    
    const response = await fetch(pinnacleUrl);
    
    if (response.ok) {
      const data = await response.json();
      const games: OddsAPIGame[] = data.data || [];
      
      if (games.length > 0) {
        const game = games[0];
        const pinnacle = game.bookmakers.find(b => b.key === 'pinnacle');
        
        if (pinnacle) {
          const spreadsMarket = pinnacle.markets.find(m => m.key === 'spreads');
          if (spreadsMarket) {
            const homeOutcome = spreadsMarket.outcomes.find(o => o.name === homeTeam);
            if (homeOutcome?.point !== undefined) {
              return { spread: homeOutcome.point, bookmaker: 'pinnacle' };
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn(`[Backfill Closing] Pinnacle fetch failed for ${gameId}:`, err);
  }
  
  // Fall back to US books
  try {
    const usUrl = `${ODDS_API_BASE_URL}/historical/sports/${NCAAB_SPORT_KEY}/odds?` +
      `apiKey=${apiKey}&regions=us&markets=spreads&oddsFormat=american` +
      `&date=${timestamp}&eventIds=${gameId}&bookmakers=draftkings,fanduel,betmgm,betrivers`;
    
    const response = await fetch(usUrl);
    
    if (response.ok) {
      const data = await response.json();
      const games: OddsAPIGame[] = data.data || [];
      
      if (games.length > 0) {
        const game = games[0];
        
        // Try each book in order
        for (const bookKey of ['draftkings', 'fanduel', 'betmgm', 'betrivers']) {
          const book = game.bookmakers.find(b => b.key === bookKey);
          if (book) {
            const spreadsMarket = book.markets.find(m => m.key === 'spreads');
            if (spreadsMarket) {
              const homeOutcome = spreadsMarket.outcomes.find(o => o.name === homeTeam);
              if (homeOutcome?.point !== undefined) {
                return { spread: homeOutcome.point, bookmaker: bookKey };
              }
            }
          }
        }
        
        // If no single book, try averaging
        const spreads: number[] = [];
        const usedBooks: string[] = [];
        
        for (const bookKey of ['draftkings', 'fanduel', 'betmgm', 'betrivers']) {
          const book = game.bookmakers.find(b => b.key === bookKey);
          if (book) {
            const spreadsMarket = book.markets.find(m => m.key === 'spreads');
            if (spreadsMarket) {
              const homeOutcome = spreadsMarket.outcomes.find(o => o.name === homeTeam);
              if (homeOutcome?.point !== undefined) {
                spreads.push(homeOutcome.point);
                usedBooks.push(bookKey);
              }
            }
          }
        }
        
        if (spreads.length > 0) {
          let avgSpread = spreads.reduce((a, b) => a + b, 0) / spreads.length;
          avgSpread = Math.round(avgSpread * 2) / 2; // Round to nearest 0.5
          return { spread: avgSpread, bookmaker: `US Avg (${usedBooks.length})` };
        }
      }
    }
  } catch (err) {
    console.warn(`[Backfill Closing] US books fetch failed for ${gameId}:`, err);
  }
  
  return null;
}

/**
 * GET endpoint to preview games for a date before backfilling
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  
  if (!date) {
    return NextResponse.json({
      success: false,
      error: 'Date parameter required (YYYY-MM-DD)',
      usage: 'GET /api/ratings/sync/backfill-closing?date=2026-01-31',
    }, { status: 400 });
  }
  
  const [year, month, day] = date.split('-').map(Number);
  const startOfDay = new Date(Date.UTC(year, month - 1, day, 5, 0, 0));
  const endOfDay = new Date(Date.UTC(year, month - 1, day + 1, 8, 0, 0));
  
  const { data, error } = await supabase
    .from('closing_lines')
    .select('game_id, home_team, away_team, commence_time, spread, spread_bookmaker, opening_spread')
    .gte('commence_time', startOfDay.toISOString())
    .lt('commence_time', endOfDay.toISOString())
    .order('commence_time', { ascending: true });
  
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  
  return NextResponse.json({
    success: true,
    date,
    gamesFound: data?.length || 0,
    games: data || [],
    instructions: 'POST to this endpoint with { "date": "YYYY-MM-DD" } to re-fetch closing lines',
  });
}
