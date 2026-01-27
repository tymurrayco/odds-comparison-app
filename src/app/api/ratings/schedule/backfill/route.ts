// src/app/api/ratings/schedule/backfill/route.ts

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ODDS_API_BASE_URL, NCAAB_SPORT_KEY } from '@/lib/ratings/constants';

// Force dynamic rendering
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Backfill API Route
 * 
 * Fetches historical games and their closing lines for a date range.
 * Use this to populate the closing_lines table with past games.
 * 
 * Query params:
 * - start: Start date (YYYY-MM-DD)
 * - end: End date (YYYY-MM-DD)
 * 
 * Example: /api/ratings/schedule/backfill?start=2026-01-20&end=2026-01-25
 */

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface OddsOutcome {
  name: string;
  price: number;
  point?: number;
}

interface OddsMarket {
  key: string;
  last_update: string;
  outcomes: OddsOutcome[];
}

interface OddsBookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: OddsMarket[];
}

interface OddsGame {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsBookmaker[];
}

// Extract spread and total from bookmakers
function extractSpreadAndTotal(game: OddsGame): { spread: number | null; total: number | null; spreadBookmaker: string | null } {
  let spread: number | null = null;
  let total: number | null = null;
  let spreadBookmaker: string | null = null;
  
  // Try Pinnacle first
  const pinnacle = game.bookmakers.find(b => b.key === 'pinnacle');
  if (pinnacle) {
    const spreadsMarket = pinnacle.markets.find(m => m.key === 'spreads');
    if (spreadsMarket) {
      const homeOutcome = spreadsMarket.outcomes.find(o => o.name === game.home_team);
      if (homeOutcome?.point !== undefined) {
        spread = homeOutcome.point;
        spreadBookmaker = 'Pinnacle';
      }
    }
    const totalsMarket = pinnacle.markets.find(m => m.key === 'totals');
    if (totalsMarket) {
      const overOutcome = totalsMarket.outcomes.find(o => o.name === 'Over');
      if (overOutcome?.point !== undefined) {
        total = overOutcome.point;
      }
    }
  }
  
  // Fall back to US books average
  if (spread === null) {
    const usBooks = ['draftkings', 'fanduel', 'betmgm', 'betrivers'];
    const spreads: number[] = [];
    const totals: number[] = [];
    const usedBooks: string[] = [];
    
    for (const bookKey of usBooks) {
      const bookmaker = game.bookmakers.find(b => b.key === bookKey);
      if (bookmaker) {
        const spreadsMarket = bookmaker.markets.find(m => m.key === 'spreads');
        if (spreadsMarket) {
          const homeOutcome = spreadsMarket.outcomes.find(o => o.name === game.home_team);
          if (homeOutcome?.point !== undefined) {
            spreads.push(homeOutcome.point);
            usedBooks.push(bookKey);
          }
        }
        if (total === null) {
          const totalsMarket = bookmaker.markets.find(m => m.key === 'totals');
          if (totalsMarket) {
            const overOutcome = totalsMarket.outcomes.find(o => o.name === 'Over');
            if (overOutcome?.point !== undefined) {
              totals.push(overOutcome.point);
            }
          }
        }
      }
    }
    
    if (spreads.length > 0) {
      spread = spreads.reduce((a, b) => a + b, 0) / spreads.length;
      spread = Math.round(spread * 2) / 2;
      spreadBookmaker = `US Avg (${usedBooks.length})`;
    }
    
    if (total === null && totals.length > 0) {
      total = totals.reduce((a, b) => a + b, 0) / totals.length;
      total = Math.round(total * 2) / 2;
    }
  }
  
  return { spread, total, spreadBookmaker };
}

export async function GET(request: Request) {
  const apiKey = process.env.ODDS_API_KEY;
  
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Odds API key not configured' },
      { status: 500 }
    );
  }
  
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('start');
  const endDate = searchParams.get('end');
  
  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: 'Missing start or end date. Use ?start=YYYY-MM-DD&end=YYYY-MM-DD' },
      { status: 400 }
    );
  }
  
  // Parse dates
  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T23:59:59Z');
  
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json(
      { error: 'Invalid date format. Use YYYY-MM-DD' },
      { status: 400 }
    );
  }
  
  if (end < start) {
    return NextResponse.json(
      { error: 'End date must be after start date' },
      { status: 400 }
    );
  }
  
  const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (daysDiff > 14) {
    return NextResponse.json(
      { error: 'Date range too large. Maximum 14 days at a time.' },
      { status: 400 }
    );
  }
  
  console.log(`[Backfill] Processing ${startDate} to ${endDate} (${daysDiff} days)`);
  
  try {
    const results = {
      daysProcessed: 0,
      gamesFound: 0,
      gamesInserted: 0,
      gamesSkipped: 0,
      errors: [] as string[],
      apiCallsUsed: 0,
    };
    
    // Process each day in the range
    const currentDate = new Date(start);
    
    while (currentDate <= end) {
      const dateStr = currentDate.toISOString().split('T')[0];
      console.log(`[Backfill] Processing ${dateStr}...`);
      
      // For each day, we need to:
      // 1. Get games that started on that day by querying from BEFORE games started
      // 2. The historical API returns upcoming games from the queried timestamp
      // 3. So we query from early morning to get games scheduled for that day
      
      // Query from 6am ET (11:00 UTC) to catch all games for the day
      const queryTime = new Date(currentDate);
      queryTime.setUTCHours(11, 0, 0, 0);
      const queryTimeStr = queryTime.toISOString().replace(/\.\d{3}Z$/, 'Z');
      
      try {
        const gamesParams = new URLSearchParams({
          apiKey,
          regions: 'us,eu',
          markets: 'spreads,totals',
          oddsFormat: 'american',
          date: queryTimeStr,
        });
        
        const gamesUrl = `${ODDS_API_BASE_URL}/historical/sports/${NCAAB_SPORT_KEY}/odds?${gamesParams.toString()}`;
        const gamesResponse = await fetch(gamesUrl);
        results.apiCallsUsed++;
        
        if (!gamesResponse.ok) {
          results.errors.push(`Failed to fetch games for ${dateStr}: ${gamesResponse.status}`);
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }
        
        const gamesData = await gamesResponse.json();
        const allGames: OddsGame[] = gamesData.data || [];
        
        console.log(`[Backfill] API returned ${allGames.length} total games for query time ${queryTimeStr}`);
        if (allGames.length > 0) {
          console.log(`[Backfill] Sample game times:`, allGames.slice(0, 3).map(g => ({ 
            teams: `${g.away_team} @ ${g.home_team}`,
            commence: g.commence_time 
          })));
        }
        
        // Filter to games that started on this specific day (in UTC)
        const dayStart = new Date(currentDate);
        dayStart.setUTCHours(0, 0, 0, 0);
        const dayEnd = new Date(currentDate);
        dayEnd.setUTCHours(23, 59, 59, 999);
        
        console.log(`[Backfill] Filtering for games between ${dayStart.toISOString()} and ${dayEnd.toISOString()}`);
        
        const todaysGames = allGames.filter(game => {
          const gameTime = new Date(game.commence_time);
          return gameTime >= dayStart && gameTime <= dayEnd;
        });
        
        console.log(`[Backfill] Found ${todaysGames.length} games on ${dateStr}`);
        results.gamesFound += todaysGames.length;
        
        // For each game, get closing line (5 min before start)
        for (const game of todaysGames) {
          // Check if we already have this game
          const { data: existing } = await supabase
            .from('closing_lines')
            .select('game_id')
            .eq('game_id', game.id)
            .single();
          
          if (existing) {
            results.gamesSkipped++;
            console.log(`[Backfill] Skipped (already exists): ${game.away_team} @ ${game.home_team}`);
            continue;
          }
          
          const gameStart = new Date(game.commence_time);
          const closingTime = new Date(gameStart.getTime() - 5 * 60 * 1000);
          const closingTimeStr = closingTime.toISOString().replace(/\.\d{3}Z$/, 'Z');
          
          try {
            const closingParams = new URLSearchParams({
              apiKey,
              regions: 'us,eu',
              markets: 'spreads,totals',
              oddsFormat: 'american',
              date: closingTimeStr,
              eventIds: game.id,
            });
            
            const closingUrl = `${ODDS_API_BASE_URL}/historical/sports/${NCAAB_SPORT_KEY}/odds?${closingParams.toString()}`;
            const closingResponse = await fetch(closingUrl);
            results.apiCallsUsed++;
            
            if (closingResponse.ok) {
              const closingData = await closingResponse.json();
              const closingGames: OddsGame[] = closingData.data || [];
              
              console.log(`[Backfill] Closing line query for ${game.away_team} @ ${game.home_team}: ${closingGames.length} results`);
              
              if (closingGames.length > 0) {
                const closingGame = closingGames[0];
                const { spread, total, spreadBookmaker } = extractSpreadAndTotal(closingGame);
                
                console.log(`[Backfill] Extracted closing: spread=${spread}, total=${total}, source=${spreadBookmaker}`);
                
                // Also try to get opening line - try multiple lookback periods
                let openingSpread: number | null = null;
                const lookbackHours = [48, 36, 24, 12];
                
                for (const hours of lookbackHours) {
                  if (openingSpread !== null) break;
                  
                  const openingTime = new Date(gameStart.getTime() - hours * 60 * 60 * 1000);
                  const openingTimeStr = openingTime.toISOString().replace(/\.\d{3}Z$/, 'Z');
                  
                  try {
                    const openingParams = new URLSearchParams({
                      apiKey,
                      regions: 'us,eu',
                      markets: 'spreads',
                      oddsFormat: 'american',
                      date: openingTimeStr,
                      eventIds: game.id,
                    });
                    
                    const openingUrl = `${ODDS_API_BASE_URL}/historical/sports/${NCAAB_SPORT_KEY}/odds?${openingParams.toString()}`;
                    const openingResponse = await fetch(openingUrl);
                    results.apiCallsUsed++;
                    
                    if (openingResponse.ok) {
                      const openingData = await openingResponse.json();
                      const openingGames: OddsGame[] = openingData.data || [];
                      
                      if (openingGames.length > 0) {
                        const og = openingGames[0];
                        const openingResult = extractSpreadAndTotal(og);
                        if (openingResult.spread !== null) {
                          openingSpread = openingResult.spread;
                          console.log(`[Backfill] Found opening spread at ${hours}h lookback: ${openingSpread}`);
                        }
                      }
                    }
                  } catch (err) {
                    // Continue to next lookback period
                  }
                }
                
                if (openingSpread === null) {
                  console.log(`[Backfill] No opening line found for ${game.away_team} @ ${game.home_team}`);
                }
                
                // Insert into database
                const { error: insertError } = await supabase
                  .from('closing_lines')
                  .upsert({
                    game_id: game.id,
                    spread,
                    total,
                    spread_bookmaker: spreadBookmaker,
                    frozen_at: closingTimeStr,
                    home_team: game.home_team,
                    away_team: game.away_team,
                    opening_spread: openingSpread,
                    commence_time: game.commence_time,
                  }, { onConflict: 'game_id' });
                
                if (insertError) {
                  results.errors.push(`Failed to insert ${game.id}: ${insertError.message}`);
                  console.log(`[Backfill] Insert error for ${game.away_team} @ ${game.home_team}:`, insertError.message);
                } else {
                  results.gamesInserted++;
                  console.log(`[Backfill] Inserted ${game.away_team} @ ${game.home_team} (spread: ${spread}, opening: ${openingSpread})`);
                }
              } else {
                console.log(`[Backfill] No closing line data for ${game.away_team} @ ${game.home_team}`);
                results.errors.push(`No closing data for ${game.away_team} @ ${game.home_team}`);
              }
            } else {
              console.log(`[Backfill] Closing line fetch failed for ${game.away_team} @ ${game.home_team}: ${closingResponse.status}`);
              results.errors.push(`Closing fetch failed for ${game.id}: ${closingResponse.status}`);
            }
          } catch (err) {
            results.errors.push(`Error processing game ${game.id}: ${err}`);
            console.log(`[Backfill] Error processing ${game.away_team} @ ${game.home_team}:`, err);
          }
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        results.daysProcessed++;
        
      } catch (err) {
        results.errors.push(`Error processing ${dateStr}: ${err}`);
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    console.log(`[Backfill] Complete:`, results);
    
    return NextResponse.json({
      success: true,
      ...results,
    });
    
  } catch (error) {
    console.error('[Backfill] Error:', error);
    return NextResponse.json(
      { error: 'Backfill failed' },
      { status: 500 }
    );
  }
}
