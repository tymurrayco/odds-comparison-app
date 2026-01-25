// src/app/api/ratings/schedule/route.ts

import { NextResponse } from 'next/server';
import { ODDS_API_BASE_URL, NCAAB_SPORT_KEY } from '@/lib/ratings/constants';

// Force dynamic rendering - disable Vercel edge caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Schedule API Route
 * 
 * Fetches upcoming NCAAB games with current odds from The Odds API.
 * Returns games for today and tomorrow with spreads from major US books.
 */

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
    // This ensures "today" and "tomorrow" match what the user sees locally
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
    
    // Tomorrow's date
    const tomorrowDate = new Date(year, month - 1, day + 1);
    const tomorrowStr = getCalendarDay(tomorrowDate);
    
    console.log('[Schedule] Timezone:', timezone, 'Today:', todayStr, 'Tomorrow:', tomorrowStr);
    
    // Filter games for today and tomorrow by comparing calendar days in user's timezone
    const filteredGames = games.filter(game => {
      const gameDate = new Date(game.commence_time);
      const gameDayStr = getCalendarDay(gameDate);
      return gameDayStr === todayStr || gameDayStr === tomorrowStr;
    });
    
    // Helper function to get spread: Pinnacle first, then US average
    const getSpreadAndTotal = (game: OddsGame) => {
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
    
    // Fetch opening lines for these games using historical endpoint
    // Try multiple lookback periods and use the earliest one that has the game
    const openingLines: Map<string, number> = new Map();
    
    // Get unique event IDs
    const eventIds = filteredGames.map(g => g.id);
    console.log(`[Schedule] Looking for opening lines for ${eventIds.length} games`);
    
    if (eventIds.length > 0) {
      // Try lookback periods from oldest to newest - use the earliest found
      const lookbackHours = [72, 48, 24, 16, 12, 6, 3, 1];
      
      for (const hours of lookbackHours) {
        try {
          const historicalDate = new Date(now.getTime() - hours * 60 * 60 * 1000);
          // Format as ISO8601 without milliseconds: 2021-10-18T12:00:00Z
          const dateStr = historicalDate.toISOString().replace(/\.\d{3}Z$/, 'Z');
          console.log(`[Schedule] Trying ${hours}h lookback (${dateStr})`);
          
          const historicalParams = new URLSearchParams({
            apiKey,
            regions: 'us,eu',
            markets: 'spreads',
            oddsFormat: 'american',
            date: dateStr,
          });
          
          const historicalUrl = `${ODDS_API_BASE_URL}/historical/sports/${NCAAB_SPORT_KEY}/odds?${historicalParams.toString()}`;
          
          const historicalResponse = await fetch(historicalUrl);
          console.log(`[Schedule] ${hours}h response status: ${historicalResponse.status}`);
          
          if (historicalResponse.ok) {
            const historicalData = await historicalResponse.json();
            console.log(`[Schedule] ${hours}h data keys:`, Object.keys(historicalData));
            
            const historicalGames: OddsGame[] = historicalData.data || [];
            console.log(`[Schedule] ${hours}h games count: ${historicalGames.length}`);
            
            if (historicalGames.length > 0) {
              console.log(`[Schedule] ${hours}h sample game ID: ${historicalGames[0].id}`);
              console.log(`[Schedule] Current game IDs: ${eventIds.slice(0, 3).join(', ')}...`);
            }
            
            for (const hGame of historicalGames) {
              // Only set if we don't already have an opening line for this game
              // (earlier lookbacks take priority)
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
                avgSpread = Math.round(avgSpread * 2) / 2; // Round to nearest 0.5
                openingLines.set(hGame.id, avgSpread);
              }
            }
            console.log(`[Schedule] After ${hours}h lookback: ${openingLines.size} opening lines found`);
          } else {
            const errorText = await historicalResponse.text();
            console.error(`[Schedule] ${hours}h error: ${errorText}`);
          }
        } catch (err) {
          console.warn(`[Schedule] Failed to fetch ${hours}h historical odds:`, err);
        }
      }
      
      console.log(`[Schedule] Final opening lines count: ${openingLines.size}`);
    }
    
    // Process games
    const scheduleGames: ScheduleGame[] = filteredGames
      .map(game => {
        const gameDate = new Date(game.commence_time);
        const gameDayStr = getCalendarDay(gameDate);
        const isToday = gameDayStr === todayStr;
        const isTomorrow = gameDayStr === tomorrowStr;
        
        // Get spread using Pinnacle first, then US average
        const { spread, total, spreadBookmaker } = getSpreadAndTotal(game);
        
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
        };
      })
      .sort((a, b) => new Date(a.commenceTime).getTime() - new Date(b.commenceTime).getTime());
    
    // Extract rate limit headers
    const requestsRemaining = response.headers.get('x-requests-remaining');
    const requestsUsed = response.headers.get('x-requests-used');
    
    console.log(`[Schedule] Found ${scheduleGames.length} games for today/tomorrow. API remaining: ${requestsRemaining}`);
    
    return NextResponse.json({
      success: true,
      games: scheduleGames,
      todayCount: scheduleGames.filter(g => g.isToday).length,
      tomorrowCount: scheduleGames.filter(g => g.isTomorrow).length,
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
