// src/app/api/ratings/schedule/route.ts

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ODDS_API_BASE_URL, NCAAB_SPORT_KEY } from '@/lib/ratings/constants';

// Force dynamic rendering - disable Vercel edge caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Schedule API Route
 * 
 * Fetches upcoming NCAAB games with current odds from The Odds API.
 * Returns games for today and tomorrow with spreads from major US books.
 * For games that have started, fetches and caches closing lines.
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

interface ClosingLine {
  game_id: string;
  spread: number | null;
  total: number | null;
  spread_bookmaker: string | null;
  frozen_at: string;
}

export interface ScheduleGame {
  id: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  spread: number | null;
  openingSpread: number | null;
  total: number | null;
  spreadBookmaker: string | null;
  isToday: boolean;
  isTomorrow: boolean;
  hasStarted: boolean;
  isFrozen: boolean;
}

// Helper function to extract spread and total from a game's bookmakers
const extractSpreadAndTotal = (game: OddsGame) => {
  let spread: number | null = null;
  let total: number | null = null;
  let spreadBookmaker: string | null = null;
  
  // 1. Try Pinnacle first
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
  
  // 2. Fall back to US books average if no Pinnacle spread
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
      spread = Math.round(spread * 2) / 2; // Round to nearest 0.5
      spreadBookmaker = `US Avg (${usedBooks.length})`;
    }
    
    if (total === null && totals.length > 0) {
      total = totals.reduce((a, b) => a + b, 0) / totals.length;
      total = Math.round(total * 2) / 2; // Round to nearest 0.5
    }
  }
  
  return { spread, total, spreadBookmaker };
};

// Fetch closing lines from historical API for started games
async function fetchClosingLines(
  gameIds: string[],
  commenceTimes: Map<string, string>,
  homeTeams: Map<string, string>,
  apiKey: string
): Promise<Map<string, { spread: number | null; total: number | null; spreadBookmaker: string | null }>> {
  const closingLines = new Map<string, { spread: number | null; total: number | null; spreadBookmaker: string | null }>();
  
  if (gameIds.length === 0) return closingLines;
  
  console.log(`[Schedule] Fetching closing lines for ${gameIds.length} started games`);
  
  // Fetch historical odds for each game individually (5 min before start)
  for (const gameId of gameIds) {
    const commenceTime = commenceTimes.get(gameId);
    if (!commenceTime) continue;
    
    const gameStart = new Date(commenceTime);
    const freezeTime = new Date(gameStart.getTime() - 5 * 60 * 1000); // 5 min before
    const freezeTimeISO = freezeTime.toISOString().replace(/\.\d{3}Z$/, 'Z');
    
    try {
      const historicalParams = new URLSearchParams({
        apiKey,
        regions: 'us,eu',
        markets: 'spreads,totals',
        oddsFormat: 'american',
        date: freezeTimeISO,
        eventIds: gameId,
      });
      
      const historicalUrl = `${ODDS_API_BASE_URL}/historical/sports/${NCAAB_SPORT_KEY}/odds?${historicalParams.toString()}`;
      
      console.log(`[Schedule] Fetching closing line for ${gameId} at ${freezeTimeISO}`);
      const response = await fetch(historicalUrl);
      
      if (response.ok) {
        const data = await response.json();
        const games: OddsGame[] = data.data || [];
        
        if (games.length > 0) {
          const game = games[0];
          const homeTeam = homeTeams.get(gameId) || game.home_team;
          
          // Extract spread and total using the same logic
          let spread: number | null = null;
          let total: number | null = null;
          let spreadBookmaker: string | null = null;
          
          // Try Pinnacle first
          const pinnacle = game.bookmakers.find(b => b.key === 'pinnacle');
          if (pinnacle) {
            const spreadsMarket = pinnacle.markets.find(m => m.key === 'spreads');
            if (spreadsMarket) {
              const homeOutcome = spreadsMarket.outcomes.find(o => o.name === homeTeam);
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
                  const homeOutcome = spreadsMarket.outcomes.find(o => o.name === homeTeam);
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
          
          closingLines.set(gameId, { spread, total, spreadBookmaker });
          console.log(`[Schedule] Got closing line for ${gameId}: spread=${spread}, total=${total}`);
        }
      } else {
        console.warn(`[Schedule] Failed to fetch closing line for ${gameId}: ${response.status}`);
      }
    } catch (err) {
      console.warn(`[Schedule] Error fetching closing line for ${gameId}:`, err);
    }
  }
  
  return closingLines;
}

export async function GET(request: Request) {
  const apiKey = process.env.ODDS_API_KEY;
  
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Odds API key not configured' },
      { status: 500 }
    );
  }
  
  // Get timezone from query param, default to America/New_York
  const { searchParams } = new URL(request.url);
  const timezone = searchParams.get('timezone') || 'America/New_York';
  
  try {
    // Fetch upcoming games with spreads and totals from Pinnacle first, then US books
    const params = new URLSearchParams({
      apiKey,
      regions: 'us,eu',
      markets: 'spreads,totals',
      oddsFormat: 'american',
    });
    
    const url = `${ODDS_API_BASE_URL}/sports/${NCAAB_SPORT_KEY}/odds?${params.toString()}`;
    
    console.log('[Schedule] Fetching upcoming NCAAB games...');
    
    const response = await fetch(url, {
      cache: 'no-store' // Don't cache - always fetch fresh data
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Schedule] Error ${response.status}:`, errorText);
      return NextResponse.json(
        { error: 'Failed to fetch schedule' },
        { status: response.status }
      );
    }
    
    const games: OddsGame[] = await response.json();
    
    // Get today and tomorrow dates in user's timezone
    const now = new Date();
    
    // Format current date in user's timezone to get the calendar day
    const userFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const userDateStr = userFormatter.format(now);
    const [month, day, year] = userDateStr.split('/').map(Number);
    
    // Helper to check if a UTC date falls on a specific calendar day in the user's timezone
    const getCalendarDay = (date: Date): string => {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date);
    };
    
    // Today's date string in user's timezone (e.g., "01/25/2026")
    const todayStr = `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
    
    // Tomorrow's date - use noon UTC to avoid any timezone edge cases
    const tomorrowDate = new Date(Date.UTC(year, month - 1, day + 1, 12, 0, 0));
    const tomorrowStr = getCalendarDay(tomorrowDate);
    
    console.log('[Schedule] Timezone:', timezone, 'Today:', todayStr, 'Tomorrow:', tomorrowStr);
    
    // Filter games for today and tomorrow by comparing calendar days in user's timezone
    const filteredGames = games.filter(game => {
      const gameDate = new Date(game.commence_time);
      const gameDayStr = getCalendarDay(gameDate);
      return gameDayStr === todayStr || gameDayStr === tomorrowStr;
    });
    
    // Identify started games (need closing lines) vs upcoming games (use live odds)
    const startedGameIds: string[] = [];
    const commenceTimes = new Map<string, string>();
    const homeTeams = new Map<string, string>();
    const awayTeams = new Map<string, string>();
    
    for (const game of filteredGames) {
      const gameStart = new Date(game.commence_time);
      commenceTimes.set(game.id, game.commence_time);
      homeTeams.set(game.id, game.home_team);
      awayTeams.set(game.id, game.away_team);
      
      if (gameStart <= now) {
        startedGameIds.push(game.id);
      }
    }
    
    console.log(`[Schedule] ${startedGameIds.length} started games, ${filteredGames.length - startedGameIds.length} upcoming games`);
    
    // Check Supabase cache for closing lines of started games
    const cachedClosingLines = new Map<string, ClosingLine>();
    const uncachedGameIds: string[] = [];
    
    if (startedGameIds.length > 0) {
      const { data: cachedData, error: cacheError } = await supabase
        .from('closing_lines')
        .select('*')
        .in('game_id', startedGameIds);
      
      if (cacheError) {
        console.warn('[Schedule] Cache lookup error:', cacheError);
      } else if (cachedData) {
        for (const row of cachedData) {
          cachedClosingLines.set(row.game_id, row);
        }
        console.log(`[Schedule] Found ${cachedData.length} cached closing lines`);
      }
      
      // Find which started games don't have cached closing lines
      for (const gameId of startedGameIds) {
        if (!cachedClosingLines.has(gameId)) {
          uncachedGameIds.push(gameId);
        }
      }
      
      console.log(`[Schedule] Need to fetch closing lines for ${uncachedGameIds.length} games`);
    }
    
    // Fetch closing lines for uncached started games
    const freshClosingLines = await fetchClosingLines(uncachedGameIds, commenceTimes, homeTeams, apiKey);
    
    // Cache the newly fetched closing lines (include team names for later retrieval)
    if (freshClosingLines.size > 0) {
      const rowsToInsert = Array.from(freshClosingLines.entries()).map(([gameId, line]) => ({
        game_id: gameId,
        spread: line.spread,
        total: line.total,
        spread_bookmaker: line.spreadBookmaker,
        frozen_at: new Date(new Date(commenceTimes.get(gameId)!).getTime() - 5 * 60 * 1000).toISOString(),
        home_team: homeTeams.get(gameId) || null,
        away_team: awayTeams.get(gameId) || null,
        commence_time: commenceTimes.get(gameId) || null,
      }));
      
      const { error: insertError } = await supabase
        .from('closing_lines')
        .upsert(rowsToInsert, { onConflict: 'game_id' });
      
      if (insertError) {
        console.warn('[Schedule] Failed to cache closing lines:', insertError);
      } else {
        console.log(`[Schedule] Cached ${rowsToInsert.length} closing lines with team names`);
      }
    }
    
    // Fetch opening lines for all games using historical endpoint
    const openingLines: Map<string, number> = new Map();
    
    if (filteredGames.length > 0) {
      // Try lookback periods from oldest to newest - use the earliest found
      const lookbackHours = [72, 48, 24, 16, 12, 6, 3, 1];
      
      for (const hours of lookbackHours) {
        try {
          const historicalDate = new Date(now.getTime() - hours * 60 * 60 * 1000);
          const dateStr = historicalDate.toISOString().replace(/\.\d{3}Z$/, 'Z');
          
          const historicalParams = new URLSearchParams({
            apiKey,
            regions: 'us,eu',
            markets: 'spreads',
            oddsFormat: 'american',
            date: dateStr,
          });
          
          const historicalUrl = `${ODDS_API_BASE_URL}/historical/sports/${NCAAB_SPORT_KEY}/odds?${historicalParams.toString()}`;
          
          const historicalResponse = await fetch(historicalUrl);
          
          if (historicalResponse.ok) {
            const historicalData = await historicalResponse.json();
            const historicalGames: OddsGame[] = historicalData.data || [];
            
            for (const hGame of historicalGames) {
              // Only set if we don't already have an opening line for this game
              if (openingLines.has(hGame.id)) continue;
              
              // Try Pinnacle first
              const pinnacle = hGame.bookmakers.find(b => b.key === 'pinnacle');
              if (pinnacle) {
                const spreadsMarket = pinnacle.markets.find(m => m.key === 'spreads');
                if (spreadsMarket) {
                  const homeOutcome = spreadsMarket.outcomes.find(o => o.name === hGame.home_team);
                  if (homeOutcome?.point !== undefined) {
                    openingLines.set(hGame.id, homeOutcome.point);
                    continue;
                  }
                }
              }
              
              // Fall back to US books average
              const usBooks = ['draftkings', 'fanduel', 'betmgm', 'betrivers'];
              const spreads: number[] = [];
              
              for (const bookKey of usBooks) {
                const bookmaker = hGame.bookmakers.find(b => b.key === bookKey);
                if (bookmaker) {
                  const spreadsMarket = bookmaker.markets.find(m => m.key === 'spreads');
                  if (spreadsMarket) {
                    const homeOutcome = spreadsMarket.outcomes.find(o => o.name === hGame.home_team);
                    if (homeOutcome?.point !== undefined) {
                      spreads.push(homeOutcome.point);
                    }
                  }
                }
              }
              
              if (spreads.length > 0) {
                let avgSpread = spreads.reduce((a, b) => a + b, 0) / spreads.length;
                avgSpread = Math.round(avgSpread * 2) / 2;
                openingLines.set(hGame.id, avgSpread);
              }
            }
          }
        } catch (err) {
          console.warn(`[Schedule] Failed to fetch ${hours}h historical odds:`, err);
        }
      }
      
      console.log(`[Schedule] Final opening lines count: ${openingLines.size}`);
      
      // Update cached closing lines with opening spreads
      if (openingLines.size > 0) {
        const gameIdsWithOpening = Array.from(openingLines.keys());
        const updates = gameIdsWithOpening.map(gameId => ({
          game_id: gameId,
          opening_spread: openingLines.get(gameId),
        }));
        
        // Batch update opening spreads
        for (const update of updates) {
          const { error: updateError } = await supabase
            .from('closing_lines')
            .update({ opening_spread: update.opening_spread })
            .eq('game_id', update.game_id);
          
          if (updateError) {
            console.warn(`[Schedule] Failed to update opening spread for ${update.game_id}:`, updateError);
          }
        }
        
        console.log(`[Schedule] Updated ${updates.length} games with opening spreads`);
      }
    }
    
    // Build the final schedule games list
    const scheduleGames: ScheduleGame[] = filteredGames.map(game => {
      const gameDate = new Date(game.commence_time);
      const gameDayStr = getCalendarDay(gameDate);
      const isToday = gameDayStr === todayStr;
      const isTomorrow = gameDayStr === tomorrowStr;
      const hasStarted = gameDate <= now;
      
      let spread: number | null = null;
      let total: number | null = null;
      let spreadBookmaker: string | null = null;
      let isFrozen = false;
      
      if (hasStarted) {
        // Use closing line (from cache or freshly fetched)
        const cached = cachedClosingLines.get(game.id);
        const fresh = freshClosingLines.get(game.id);
        
        if (cached) {
          spread = cached.spread;
          total = cached.total;
          spreadBookmaker = cached.spread_bookmaker;
          isFrozen = true;
        } else if (fresh) {
          spread = fresh.spread;
          total = fresh.total;
          spreadBookmaker = fresh.spreadBookmaker;
          isFrozen = true;
        }
      } else {
        // Use live odds
        const liveOdds = extractSpreadAndTotal(game);
        spread = liveOdds.spread;
        total = liveOdds.total;
        spreadBookmaker = liveOdds.spreadBookmaker;
      }
      
      // Get opening spread from historical data
      const openingSpread = openingLines.get(game.id) ?? null;
      
      return {
        id: game.id,
        commenceTime: game.commence_time,
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        spread,
        openingSpread,
        total,
        spreadBookmaker,
        isToday,
        isTomorrow,
        hasStarted,
        isFrozen,
      };
    }).sort((a, b) => new Date(a.commenceTime).getTime() - new Date(b.commenceTime).getTime());
    
    // Extract rate limit headers
    const requestsRemaining = response.headers.get('x-requests-remaining');
    const requestsUsed = response.headers.get('x-requests-used');
    
    console.log(`[Schedule] Found ${scheduleGames.length} games for today/tomorrow. API remaining: ${requestsRemaining}`);
    
    return NextResponse.json({
      success: true,
      games: scheduleGames,
      todayCount: scheduleGames.filter(g => g.isToday).length,
      tomorrowCount: scheduleGames.filter(g => g.isTomorrow).length,
      startedCount: scheduleGames.filter(g => g.hasStarted).length,
      frozenCount: scheduleGames.filter(g => g.isFrozen).length,
      totalFromApi: games.length,
      filteredCount: filteredGames.length,
      debug: {
        timezone,
        todayStr,
        tomorrowStr,
        serverTime: new Date().toISOString(),
      },
      requestsRemaining,
      requestsUsed,
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      }
    });
    
  } catch (error) {
    console.error('[Schedule] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch schedule' },
      { status: 500 }
    );
  }
}
