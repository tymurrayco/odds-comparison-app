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
 * 
 * OPENING LINES: Read from closing_lines.opening_spread (written by SBR Openers tab).
 * No Odds API historical calls are made for opening lines.
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
  opening_spread?: number | null;
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
// Uses US Consensus Average (DraftKings, FanDuel, BetMGM, BetRivers)
const extractSpreadAndTotal = (game: OddsGame) => {
  let spread: number | null = null;
  let total: number | null = null;
  let spreadBookmaker: string | null = null;
  
  // US Consensus Average
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
      const totalsMarket = bookmaker.markets.find(m => m.key === 'totals');
      if (totalsMarket) {
        const overOutcome = totalsMarket.outcomes.find(o => o.name === 'Over');
        if (overOutcome?.point !== undefined) {
          totals.push(overOutcome.point);
        }
      }
    }
  }
  
  if (spreads.length > 0) {
    spread = spreads.reduce((a, b) => a + b, 0) / spreads.length;
    spread = Math.round(spread * 2) / 2; // Round to nearest 0.5
    spreadBookmaker = `US Avg (${usedBooks.length})`;
  }
  
  if (totals.length > 0) {
    total = totals.reduce((a, b) => a + b, 0) / totals.length;
    total = Math.round(total * 2) / 2; // Round to nearest 0.5
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
        regions: 'us',
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
          
          // Extract spread and total using US Consensus Average
          let spread: number | null = null;
          let total: number | null = null;
          let spreadBookmaker: string | null = null;
          
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
              const totalsMarket = bookmaker.markets.find(m => m.key === 'totals');
              if (totalsMarket) {
                const overOutcome = totalsMarket.outcomes.find(o => o.name === 'Over');
                if (overOutcome?.point !== undefined) {
                  totals.push(overOutcome.point);
                }
              }
            }
          }
          
          if (spreads.length > 0) {
            spread = spreads.reduce((a, b) => a + b, 0) / spreads.length;
            spread = Math.round(spread * 2) / 2;
            spreadBookmaker = `US Avg (${usedBooks.length})`;
          }
          
          if (totals.length > 0) {
            total = totals.reduce((a, b) => a + b, 0) / totals.length;
            total = Math.round(total * 2) / 2;
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
    // Fetch upcoming games with spreads and totals from US books
    const params = new URLSearchParams({
      apiKey,
      regions: 'us',
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
      // Before inserting real rows, grab openers from any synthetic SBR rows for these teams
      const sbrOpeners = new Map<string, number>(); // "away|home" → opener
      const sbrIdsToDelete: string[] = [];
      
      const freshTeamKeys = Array.from(freshClosingLines.keys()).map(gameId => ({
        gameId,
        home: homeTeams.get(gameId)?.toLowerCase(),
        away: awayTeams.get(gameId)?.toLowerCase(),
      })).filter(g => g.home && g.away);
      
      if (freshTeamKeys.length > 0) {
        const startOfDay = new Date(Date.UTC(year, month - 1, day, 3, 0, 0));
        const endOfDay = new Date(Date.UTC(year, month - 1, day + 1, 8, 0, 0));
        
        const { data: sbrRows } = await supabase
          .from('closing_lines')
          .select('game_id, home_team, away_team, opening_spread')
          .like('game_id', 'sbr-%')
          .gte('commence_time', startOfDay.toISOString())
          .lt('commence_time', endOfDay.toISOString())
          .not('opening_spread', 'is', null);
        
        if (sbrRows) {
          for (const row of sbrRows) {
            if (row.home_team && row.away_team && row.opening_spread !== null) {
              const key = `${row.away_team.toLowerCase()}|${row.home_team.toLowerCase()}`;
              sbrOpeners.set(key, row.opening_spread);
              sbrIdsToDelete.push(row.game_id);
            }
          }
        }
      }
      
      const rowsToInsert = Array.from(freshClosingLines.entries()).map(([gameId, line]) => {
        const home = homeTeams.get(gameId) || null;
        const away = awayTeams.get(gameId) || null;
        const key = home && away ? `${away.toLowerCase()}|${home.toLowerCase()}` : '';
        const sbrOpener = sbrOpeners.get(key) ?? null;
        
        return {
          game_id: gameId,
          spread: line.spread,
          total: line.total,
          spread_bookmaker: line.spreadBookmaker,
          frozen_at: new Date(new Date(commenceTimes.get(gameId)!).getTime() - 5 * 60 * 1000).toISOString(),
          home_team: home,
          away_team: away,
          commence_time: commenceTimes.get(gameId) || null,
          opening_spread: sbrOpener, // Merge opener from synthetic SBR row
        };
      });
      
      const { error: insertError } = await supabase
        .from('closing_lines')
        .upsert(rowsToInsert, { onConflict: 'game_id' });
      
      if (insertError) {
        console.warn('[Schedule] Failed to cache closing lines:', insertError);
      } else {
        console.log(`[Schedule] Cached ${rowsToInsert.length} closing lines with team names`);
        
        // Delete synthetic SBR rows that were merged into real rows
        if (sbrIdsToDelete.length > 0) {
          const { error: deleteErr } = await supabase
            .from('closing_lines')
            .delete()
            .in('game_id', sbrIdsToDelete);
          
          if (deleteErr) {
            console.warn('[Schedule] Failed to cleanup synthetic SBR rows:', deleteErr);
          } else {
            console.log(`[Schedule] Cleaned up ${sbrIdsToDelete.length} synthetic SBR rows`);
          }
        }
      }
    }
    
    // ============================================================
    // OPENING LINES - READ FROM SUPABASE (SBR IS SOURCE OF TRUTH)
    // ============================================================
    // SBR openers are saved via the SBR Openers tab → /api/ratings/sbr-openers/save
    // No Odds API calls needed — just read what SBR has already written.
    // Two lookups: 1) by Odds API game_id, 2) by team name for SBR-inserted rows
    // ============================================================
    
    const openingLines: Map<string, number> = new Map();
    const allGameIds = filteredGames.map(g => g.id);
    let cachedOpeningCount = 0;
    
    if (allGameIds.length > 0) {
      // Lookup 1: Match by Odds API game_id (for games where SBR updated existing rows)
      const { data: cachedOpenings, error: openingCacheError } = await supabase
        .from('closing_lines')
        .select('game_id, opening_spread')
        .in('game_id', allGameIds)
        .not('opening_spread', 'is', null);
      
      if (openingCacheError) {
        console.warn('[Schedule] Opening spread lookup error:', openingCacheError);
      } else if (cachedOpenings) {
        for (const row of cachedOpenings) {
          if (row.opening_spread !== null) {
            openingLines.set(row.game_id, row.opening_spread);
          }
        }
        cachedOpeningCount = cachedOpenings.length;
        console.log(`[Schedule] Found ${cachedOpenings.length} SBR opening spreads by game_id`);
      }
      
      // Lookup 2: For games still missing openers, check SBR-inserted rows by team name
      const gamesNeedingOpeners = filteredGames.filter(g => !openingLines.has(g.id));
      
      if (gamesNeedingOpeners.length > 0) {
        // Date range covering today + tomorrow (since filteredGames includes both)
        const startOfDay = new Date(Date.UTC(year, month - 1, day, 3, 0, 0));
        const endOfRange = new Date(Date.UTC(year, month - 1, day + 2, 8, 0, 0));
        
        const { data: sbrRows, error: sbrError } = await supabase
          .from('closing_lines')
          .select('home_team, away_team, opening_spread')
          .gte('commence_time', startOfDay.toISOString())
          .lt('commence_time', endOfRange.toISOString())
          .not('opening_spread', 'is', null);
        
        if (sbrError) {
          console.warn('[Schedule] SBR opener team-name lookup error:', sbrError);
        } else if (sbrRows) {
          // Build a lookup by "away|home" (lowercase)
          const teamLookup = new Map<string, number>();
          for (const row of sbrRows) {
            if (row.opening_spread !== null && row.home_team && row.away_team) {
              const key = `${row.away_team.toLowerCase()}|${row.home_team.toLowerCase()}`;
              teamLookup.set(key, row.opening_spread);
            }
          }
          
          let teamMatchCount = 0;
          for (const game of gamesNeedingOpeners) {
            const key = `${game.away_team.toLowerCase()}|${game.home_team.toLowerCase()}`;
            const opener = teamLookup.get(key);
            if (opener !== undefined) {
              openingLines.set(game.id, opener);
              teamMatchCount++;
            }
          }
          
          cachedOpeningCount += teamMatchCount;
          console.log(`[Schedule] Found ${teamMatchCount} additional SBR opening spreads by team name`);
        }
      }
      
      const missing = allGameIds.length - openingLines.size;
      if (missing > 0) {
        console.log(`[Schedule] ${missing} games without opening spreads (save via SBR Openers tab)`);
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
      
      // Get opening spread (from cache or freshly fetched)
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
      // Opening line stats (SBR is source of truth)
      openingLinesStats: {
        total: allGameIds.length,
        fromSBR: cachedOpeningCount,
        missing: allGameIds.length - openingLines.size,
      },
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
