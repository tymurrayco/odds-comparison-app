// src/app/api/ratings/calculate/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { 
  KenPomRating, 
  RatingsConfig, 
  RatingsSnapshot,
  GameAdjustment,
  ClosingLineSource,
  OddsAPIGame,
} from '@/lib/ratings/types';
import { 
  DEFAULT_RATINGS_CONFIG, 
  FINAL_RATINGS_DATE,
  SEASON_DATES,
  ODDS_API_BASE_URL,
  NCAAB_SPORT_KEY,
  KENPOM_API_BASE_URL,
} from '@/lib/ratings/constants';
import {
  processGame,
  extractClosingSpread,
  createSnapshot,
} from '@/lib/ratings/engine';
import { fuzzyMatchTeam, findTeamByName } from '@/lib/ratings/team-mapping';
import {
  loadRatings,
  saveRating,
  initializeRatingsFromKenpom,
  getProcessedGameIds,
  saveGameAdjustment,
  loadAdjustments,
  cacheClosingLine,
  getCachedClosingLine,
  loadConfig,
  saveConfig,
  getStats,
  saveMatchingLog,
  loadMatchingLogs,
  clearMatchingLogs,
  getMatchingLogStats,
  MatchingLog,
  buildOverrideMap,
  buildOddsApiOverrideMap,
  saveOddsApiTeams,
} from '@/lib/ratings/supabase';

/**
 * Calculate Ratings API Route
 * 
 * Main endpoint for calculating power ratings.
 * Now uses Supabase for persistence.
 * 
 * GET: Returns current ratings from Supabase
 * POST: Processes new games and updates ratings
 * 
 * POST Body:
 * {
 *   hca?: number,
 *   closingSource?: 'pinnacle' | 'us_average',
 *   forceRefresh?: boolean,  // Re-initialize from KenPom
 *   maxGames?: number (default: 100)
 * }
 */

// ============================================================================
// ESPN Games Fetching (inline to avoid internal HTTP calls)
// ============================================================================

interface ESPNCompetitor {
  homeAway: 'home' | 'away';
  team?: {
    displayName?: string;
    name?: string;
    abbreviation?: string;
  };
  score?: string;
  winner?: boolean;
}

interface ESPNVenue {
  fullName?: string;
  city?: string;
  state?: string;
  neutral?: boolean;
}

interface ESPNCompetition {
  id: string;
  date: string;
  competitors?: ESPNCompetitor[];
  venue?: ESPNVenue;
  neutralSite?: boolean;
  conferenceCompetition?: boolean;
  status?: {
    type?: {
      state?: string;
      completed?: boolean;
    };
  };
}

interface ESPNEvent {
  id: string;
  date: string;
  name?: string;
  competitions?: ESPNCompetition[];
}

interface ESPNResponse {
  events?: ESPNEvent[];
}

export interface HistoricalGame {
  id: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamAbbr?: string;
  awayTeamAbbr?: string;
  homeScore?: number;
  awayScore?: number;
  isCompleted: boolean;
  isNeutralSite: boolean;
  venue?: string;
}

// Format date for ESPN API (YYYYMMDD)
function formatDateForESPN(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

// Parse date string (YYYY-MM-DD) to Date object
function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Fetch games for a specific date from ESPN
async function fetchGamesForDate(date: Date): Promise<HistoricalGame[]> {
  const dateStr = formatDateForESPN(date);
  const apiUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${dateStr}&limit=200&groups=50`;
  
  try {
    const response = await fetch(apiUrl, { 
      next: { revalidate: 3600 } // Cache for 1 hour
    });
    
    if (!response.ok) {
      console.error(`[Historical Games] ESPN API error for date ${dateStr}:`, response.status);
      return [];
    }
    
    const data: ESPNResponse = await response.json();
    const games: HistoricalGame[] = [];
    
    if (data.events && Array.isArray(data.events)) {
      for (const event of data.events) {
        const competition = event.competitions?.[0];
        if (!competition) continue;
        
        const competitors = competition.competitors || [];
        const homeTeam = competitors.find(c => c.homeAway === 'home');
        const awayTeam = competitors.find(c => c.homeAway === 'away');
        
        if (!homeTeam || !awayTeam) continue;
        
        const isCompleted = competition.status?.type?.completed === true ||
                           competition.status?.type?.state === 'post';
        
        // Determine if neutral site
        const isNeutralSite = competition.neutralSite === true || 
                             competition.venue?.neutral === true;
        
        games.push({
          id: event.id,
          date: competition.date || event.date,
          homeTeam: homeTeam.team?.displayName || homeTeam.team?.name || 'Unknown',
          awayTeam: awayTeam.team?.displayName || awayTeam.team?.name || 'Unknown',
          homeTeamAbbr: homeTeam.team?.abbreviation,
          awayTeamAbbr: awayTeam.team?.abbreviation,
          homeScore: homeTeam.score ? parseInt(homeTeam.score) : undefined,
          awayScore: awayTeam.score ? parseInt(awayTeam.score) : undefined,
          isCompleted,
          isNeutralSite,
          venue: competition.venue?.fullName,
        });
      }
    }
    
    return games;
  } catch (error) {
    console.error(`[Historical Games] Error fetching date ${dateStr}:`, error);
    return [];
  }
}

// Fetch historical games directly (replaces internal API call)
async function fetchHistoricalGames(
  startDateStr: string, 
  endDateStr: string, 
  limit: number
): Promise<{ success: boolean; games: HistoricalGame[]; error?: string }> {
  const startDate = parseDate(startDateStr);
  const endDate = parseDate(endDateStr);
  
  // Validate dates
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return { success: false, games: [], error: 'Invalid date format' };
  }
  
  // Don't allow more than 120 days of data at once
  const maxDays = 120;
  const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysDiff > maxDays) {
    return { success: false, games: [], error: `Date range too large. Maximum is ${maxDays} days.` };
  }
  
  console.log(`[Historical Games] Fetching games from ${startDateStr} to ${endDateStr}`);
  
  try {
    const allGames: HistoricalGame[] = [];
    const currentDate = new Date(startDate);
    let daysProcessed = 0;
    
    // Iterate through each day
    while (currentDate <= endDate && allGames.length < limit) {
      const dayGames = await fetchGamesForDate(currentDate);
      
      // Only add completed games
      const completedGames = dayGames.filter(g => g.isCompleted);
      allGames.push(...completedGames);
      
      daysProcessed++;
      currentDate.setDate(currentDate.getDate() + 1);
      
      // Small delay to avoid rate limiting
      if (daysProcessed % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // Sort by date (oldest first for chronological processing)
    allGames.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    // Apply limit
    const limitedGames = allGames.slice(0, limit);
    
    console.log(`[Historical Games] Found ${limitedGames.length} completed games over ${daysProcessed} days`);
    
    return { success: true, games: limitedGames };
    
  } catch (error) {
    console.error('[Historical Games] Error:', error);
    return { success: false, games: [], error: 'Failed to fetch historical games' };
  }
}

// ============================================================================
// KenPom Fetching (inline to avoid internal HTTP calls)
// ============================================================================

async function fetchKenPomArchive(date: string): Promise<{ success: boolean; data?: KenPomRating[]; error?: string }> {
  const apiKey = process.env.KENPOM_API_KEY;
  
  if (!apiKey) {
    return { success: false, error: 'KenPom API key not configured' };
  }
  
  try {
    const params = new URLSearchParams();
    params.set('d', date);
    
    const url = `${KENPOM_API_BASE_URL}?endpoint=archive&${params.toString()}`;
    
    console.log(`[KenPom API] Fetching archive for date: ${date}`);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[KenPom API] Error ${response.status}:`, errorText);
      return { success: false, error: `KenPom API error: ${response.status}` };
    }
    
    const data = await response.json();
    
    console.log(`[KenPom API] Success: ${Array.isArray(data) ? data.length : 0} teams`);
    
    return { success: true, data };
    
  } catch (error) {
    console.error('[KenPom API] Error:', error);
    return { success: false, error: 'Failed to fetch KenPom data' };
  }
}

// ============================================================================
// Main Route Handlers
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const season = parseInt(searchParams.get('season') || '2026');
    const includeLogs = searchParams.get('logs') === 'true';
    
    // Load from Supabase
    const [ratings, adjustments, config, stats] = await Promise.all([
      loadRatings(season),
      loadAdjustments(season),
      loadConfig(),
      getStats(season),
    ]);
    
    if (ratings.size === 0) {
      return NextResponse.json({
        success: false,
        error: 'No ratings found. Use POST to initialize.',
        hint: 'POST /api/ratings/calculate with { forceRefresh: true } to initialize from KenPom',
      });
    }
    
    // Create snapshot from loaded data
    const snapshot: RatingsSnapshot = {
      asOfDate: new Date().toISOString(),
      season,
      hca: config?.hca || DEFAULT_RATINGS_CONFIG.hca,
      closingSource: (config?.closing_source as ClosingLineSource) || DEFAULT_RATINGS_CONFIG.closingSource,
      gamesProcessed: stats.gamesProcessed,
      ratings: Array.from(ratings.values()).sort((a, b) => b.rating - a.rating),
      adjustments,
    };
    
    // Optionally include matching logs
    let matchingLogs = null;
    let matchingStats = null;
    if (includeLogs) {
      [matchingLogs, matchingStats] = await Promise.all([
        loadMatchingLogs(season),
        getMatchingLogStats(season),
      ]);
    }
    
    return NextResponse.json({
      success: true,
      lastCalculated: stats.lastGameDate,
      syncRange: {
        firstGameDate: stats.firstGameDate,
        lastGameDate: stats.lastGameDate,
      },
      config: {
        hca: snapshot.hca,
        closingSource: snapshot.closingSource,
        season,
      },
      summary: {
        teamsCount: stats.teamsCount,
        gamesProcessed: stats.gamesProcessed,
      },
      data: snapshot,
      ...(includeLogs && { matchingLogs, matchingStats }),
    });
    
  } catch (error) {
    console.error('[Calculate Ratings] GET error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load ratings',
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    
    // Check for recalculate actions first
    if (body.action === 'recalculate') {
      return await handleRecalculate(request, body);
    }
    if (body.action === 'recalculate-from') {
      return await handleRecalculateFrom(body);
    }
    
    const config: RatingsConfig = {
      ...DEFAULT_RATINGS_CONFIG,
      hca: body.hca ?? DEFAULT_RATINGS_CONFIG.hca,
      closingSource: body.closingSource ?? DEFAULT_RATINGS_CONFIG.closingSource,
    };
    
    const maxGames = body.maxGames ?? 100;
    const forceRefresh = body.forceRefresh ?? false;
    const startDate = body.startDate; // Optional: YYYY-MM-DD
    const endDate = body.endDate;     // Optional: YYYY-MM-DD
    
    console.log('[Calculate Ratings] Starting with config:', config);
    console.log('[Calculate Ratings] forceRefresh:', forceRefresh, 'maxGames:', maxGames);
    if (startDate || endDate) {
      console.log(`[Calculate Ratings] Date range: ${startDate || 'season start'} to ${endDate || 'today'}`);
    }
    
    // Step 1: Load or initialize ratings
    let ratings = await loadRatings(config.season);
    
    if (ratings.size === 0 || forceRefresh) {
      console.log('[Calculate Ratings] Initializing ratings from KenPom...');
      
      // Fetch from KenPom directly (no internal HTTP call)
      const kenpomResult = await fetchKenPomArchive(FINAL_RATINGS_DATE[config.previousSeason]);
      
      if (!kenpomResult.success || !kenpomResult.data) {
        return NextResponse.json({
          success: false,
          error: `Failed to fetch KenPom ratings: ${kenpomResult.error}`,
        }, { status: 500 });
      }
      
      const kenpomRatings: KenPomRating[] = kenpomResult.data;
      
      if (kenpomRatings.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'No KenPom ratings returned',
        }, { status: 500 });
      }
      
      // Initialize in Supabase
      await initializeRatingsFromKenpom(kenpomRatings, config.season);
      
      // Reload
      ratings = await loadRatings(config.season);
      console.log(`[Calculate Ratings] Initialized ${ratings.size} ratings in Supabase`);
    } else {
      console.log(`[Calculate Ratings] Loaded ${ratings.size} existing ratings from Supabase`);
    }
    
    // Step 2: Get already processed games
    const processedGameIds = await getProcessedGameIds(config.season);
    console.log(`[Calculate Ratings] ${processedGameIds.size} games already processed`);
    
    // Step 3: Fetch completed games from ESPN directly (no internal HTTP call)
    const seasonStart = SEASON_DATES[config.season].start;
    const today = new Date().toISOString().split('T')[0];
    
    // Use provided date range or defaults
    const queryStartDate = startDate || seasonStart;
    const queryEndDate = endDate || today;
    
    const gamesResult = await fetchHistoricalGames(
      queryStartDate, 
      queryEndDate, 
      maxGames + processedGameIds.size
    );
    
    if (!gamesResult.success) {
      console.warn('[Calculate Ratings] Failed to fetch games from ESPN:', gamesResult.error);
      // Return current state
      const adjustments = await loadAdjustments(config.season);
      const snapshot = createSnapshot(ratings, adjustments, config);
      return NextResponse.json({
        success: true,
        message: 'Returned existing ratings (ESPN fetch failed)',
        data: snapshot,
      });
    }
    
    const allGames: HistoricalGame[] = gamesResult.games;
    
    // Filter to only unprocessed games
    const newGames = allGames.filter(g => !processedGameIds.has(g.id));
    console.log(`[Calculate Ratings] ${allGames.length} total games from ESPN, ${processedGameIds.size} already processed, ${newGames.length} new games to process`);
    
    // Debug: Log first few processed IDs and first few game IDs to verify matching
    if (processedGameIds.size > 0 && allGames.length > 0) {
      const sampleProcessed = Array.from(processedGameIds).slice(0, 3);
      const sampleGames = allGames.slice(0, 3).map(g => g.id);
      console.log(`[Calculate Ratings] Sample processed IDs: ${sampleProcessed.join(', ')}`);
      console.log(`[Calculate Ratings] Sample ESPN game IDs: ${sampleGames.join(', ')}`);
    }
    
    if (newGames.length === 0) {
      // No new games - return current state
      const adjustments = await loadAdjustments(config.season);
      const snapshot = createSnapshot(ratings, adjustments, config);
      
      return NextResponse.json({
        success: true,
        message: 'No new games to process',
        config: { hca: config.hca, closingSource: config.closingSource, season: config.season },
        summary: { teamsCount: ratings.size, gamesProcessed: processedGameIds.size },
        data: snapshot,
      });
    }
    
    // Step 4: Process new games
    console.log('[Calculate Ratings] Processing new games...');
    
    // Clear previous matching logs for fresh run
    await clearMatchingLogs(config.season);
    
    // Load team overrides for matching
    const overrideMap = await buildOverrideMap();
    const oddsApiOverrideMap = await buildOddsApiOverrideMap();
    console.log(`[Calculate Ratings] Loaded ${overrideMap.size} team overrides, ${oddsApiOverrideMap.size} Odds API mappings`);
    
    const oddsApiKey = process.env.ODDS_API_KEY;
    const newAdjustments: GameAdjustment[] = [];
    let gamesProcessed = 0;
    let gamesSkipped = 0;
    
    // Build ratings lookup for team matching
    const ratingsLookup = new Map<string, number>();
    for (const [name, rating] of ratings) {
      ratingsLookup.set(name, rating.rating);
    }
    
    // Helper function to find team with override support
    const findTeamWithOverride = (teamName: string) => {
      // Check override map first
      const overrideName = overrideMap.get(teamName.toLowerCase());
      if (overrideName && ratingsLookup.has(overrideName)) {
        return { name: overrideName, rating: ratingsLookup.get(overrideName)! };
      }
      // Fall back to normal matching
      return findTeamByName(teamName, ratingsLookup);
    };
    
    if (!oddsApiKey) {
      console.warn('[Calculate Ratings] No Odds API key');
    } else {
      // Limit to maxGames new games
      const gamesToProcess = newGames.slice(0, maxGames);
      
      // Collect all team names we see from Odds API across all games
      const allSeenOddsApiTeams: Set<string> = new Set();
      
      // Cache Odds API responses by timestamp to avoid redundant calls
      const usCache: Map<string, OddsAPIGame[]> = new Map();
      
      console.log(`[Calculate Ratings] Processing ${gamesToProcess.length} games...`);
      
      for (let i = 0; i < gamesToProcess.length; i++) {
        const game = gamesToProcess[i];
        
        // SAFEGUARD: Double-check this game hasn't been processed already
        // This prevents reprocessing if there's any ID mismatch issue
        if (processedGameIds.has(game.id)) {
          console.log(`[Calculate Ratings] SKIPPING already processed game ${game.id}: ${game.homeTeam} vs ${game.awayTeam}`);
          continue;
        }
        
        // Progress log every 10 games
        if (i % 10 === 0) {
          console.log(`[Calculate Ratings] Processing game ${i + 1}/${gamesToProcess.length}: ${game.homeTeam} vs ${game.awayTeam}`);
        }
        
        const matchingLog: MatchingLog = {
          gameId: game.id,
          gameDate: game.date,
          espnHome: game.homeTeam,
          espnAway: game.awayTeam,
          matchedHome: null,
          matchedAway: null,
          homeFound: false,
          awayFound: false,
          status: 'success',
          skipReason: null,
          closingSpread: null,
        };
        
        try {
          // Check cache first
          let closingSpread: number | null = null;
          let bookmakers: string[] = [];
          
          const cached = await getCachedClosingLine(game.id);
          
          if (cached && cached.closing_source === 'us_average') {
            closingSpread = cached.closing_spread;
            bookmakers = cached.bookmakers || [];
          } else {
            // Fetch from Odds API - US Consensus Average
            const gameTime = new Date(game.date);
            const closingTime = new Date(gameTime.getTime() - 5 * 60 * 1000);
            const closingTimeStr = closingTime.toISOString().replace('.000Z', 'Z');
            
            // OPTIMIZATION: Round to nearest hour for cache key to reduce API calls
            // Games within the same hour will share the same API response
            const cacheKeyTime = new Date(closingTime);
            cacheKeyTime.setMinutes(0, 0, 0); // Round down to hour
            const cacheKey = cacheKeyTime.toISOString().replace('.000Z', 'Z');
            
            // US Consensus books
            const US_CONSENSUS_BOOKS = ['draftkings', 'fanduel', 'betmgm', 'betrivers'];
            
            let matchingOddsGame: OddsAPIGame | null = null;
            let closingLine: { spread: number | null; bookmakers: string[] } = { spread: null, bookmakers: [] };
            const usedSource: ClosingLineSource = 'us_average';
            
            // Fetch US Consensus Average - use cache if available
            let usGames: OddsAPIGame[] | undefined = usCache.get(cacheKey);
            
            if (usGames === undefined) {
              const usUrl = `${ODDS_API_BASE_URL}/historical/sports/${NCAAB_SPORT_KEY}/odds?` +
                `apiKey=${oddsApiKey}&regions=us&markets=spreads&oddsFormat=american` +
                `&date=${closingTimeStr}&bookmakers=${US_CONSENSUS_BOOKS.join(',')}`;
              
              const usResponse = await fetch(usUrl);
              
              if (!usResponse.ok) {
                usGames = [];
                usCache.set(cacheKey, []);
              } else {
                const usData = await usResponse.json();
                const fetchedUsGames: OddsAPIGame[] = usData.data || [];
                usGames = fetchedUsGames;
                usCache.set(cacheKey, fetchedUsGames);
                
                // Capture team names
                for (const g of fetchedUsGames) {
                  allSeenOddsApiTeams.add(g.home_team);
                  allSeenOddsApiTeams.add(g.away_team);
                }
              }
            }
            
            if (usGames && usGames.length > 0) {
              matchingOddsGame = findMatchingGame(game, usGames, oddsApiOverrideMap);
              
              if (matchingOddsGame) {
                closingLine = extractClosingSpread(matchingOddsGame, 'us_average', US_CONSENSUS_BOOKS);
              }
            }
            
            if (!matchingOddsGame) {
              matchingLog.status = 'no_odds';
              matchingLog.skipReason = 'No matching game in Odds API';
              await saveMatchingLog(matchingLog, config.season);
              gamesSkipped++;
              continue;
            }
            
            if (closingLine.spread === null) {
              matchingLog.status = 'no_spread';
              matchingLog.skipReason = 'No spread data available';
              await saveMatchingLog(matchingLog, config.season);
              gamesSkipped++;
              continue;
            }
            
            closingSpread = closingLine.spread;
            bookmakers = closingLine.bookmakers;
            
            // Cache it (using US Consensus Average)
            await cacheClosingLine(
              game.id,
              matchingOddsGame.id,
              game.date,
              game.homeTeam,
              game.awayTeam,
              closingSpread,
              usedSource,
              bookmakers
            );
          }
          
          matchingLog.closingSpread = closingSpread;
          
          if (closingSpread === null) {
            matchingLog.status = 'no_spread';
            matchingLog.skipReason = 'No spread data';
            await saveMatchingLog(matchingLog, config.season);
            gamesSkipped++;
            continue;
          }
          
          // Map team names and check if they exist in ratings
          const homeMatch = findTeamWithOverride(game.homeTeam);
          const awayMatch = findTeamWithOverride(game.awayTeam);
          
          matchingLog.matchedHome = homeMatch?.name || fuzzyMatchTeam(game.homeTeam);
          matchingLog.matchedAway = awayMatch?.name || fuzzyMatchTeam(game.awayTeam);
          matchingLog.homeFound = !!homeMatch;
          matchingLog.awayFound = !!awayMatch;
          
          // Determine status based on matching
          if (!homeMatch && !awayMatch) {
            matchingLog.status = 'both_not_found';
            matchingLog.skipReason = 'Neither team found in KenPom ratings';
            await saveMatchingLog(matchingLog, config.season);
            gamesSkipped++;
            continue;
          } else if (!homeMatch) {
            matchingLog.status = 'home_not_found';
            matchingLog.skipReason = `Home team "${game.homeTeam}" not found`;
            await saveMatchingLog(matchingLog, config.season);
            gamesSkipped++;
            continue;
          } else if (!awayMatch) {
            matchingLog.status = 'away_not_found';
            matchingLog.skipReason = `Away team "${game.awayTeam}" not found`;
            await saveMatchingLog(matchingLog, config.season);
            gamesSkipped++;
            continue;
          }
          
          // Process the game
          const adjustment = processGame(
            {
              id: game.id,
              date: game.date,
              homeTeam: homeMatch.name,
              awayTeam: awayMatch.name,
              closingSpread,
              closingSource: config.closingSource,
              isNeutralSite: game.isNeutralSite,
            },
            ratings,
            config
          );
          
          if (adjustment) {
            // CRITICAL: Add game to processedGameIds to prevent reprocessing within same batch
            processedGameIds.add(game.id);
            
            // Save adjustment to Supabase
            await saveGameAdjustment(adjustment, config.season);
            
            // Update team ratings in Supabase
            const homeRating = ratings.get(adjustment.homeTeam);
            const awayRating = ratings.get(adjustment.awayTeam);
            
            if (homeRating) await saveRating(homeRating, config.season);
            if (awayRating) await saveRating(awayRating, config.season);
            
            newAdjustments.push(adjustment);
            gamesProcessed++;
            
            // Log successful match
            matchingLog.status = 'success';
            await saveMatchingLog(matchingLog, config.season);
          } else {
            matchingLog.status = 'both_not_found';
            matchingLog.skipReason = 'processGame returned null';
            await saveMatchingLog(matchingLog, config.season);
            gamesSkipped++;
          }
          
          // Small delay for rate limiting
          await new Promise(resolve => setTimeout(resolve, 50));
          
        } catch (err) {
          console.warn(`[Calculate Ratings] Error processing game ${game.id}:`, err);
          matchingLog.status = 'no_odds';
          matchingLog.skipReason = `Error: ${err instanceof Error ? err.message : 'Unknown'}`;
          await saveMatchingLog(matchingLog, config.season);
          gamesSkipped++;
        }
      }
      
      // Save all Odds API team names we've seen (batch operation at end)
      if (allSeenOddsApiTeams.size > 0) {
        console.log(`[Calculate Ratings] Saving ${allSeenOddsApiTeams.size} Odds API team names`);
        await saveOddsApiTeams([...allSeenOddsApiTeams]);
      }
    }
    
    console.log(`[Calculate Ratings] Finished: ${gamesProcessed} new games processed, ${gamesSkipped} skipped`);
    
    // Save config
    await saveConfig(config.hca, config.closingSource, config.season, today);
    
    // Load all adjustments for snapshot
    const allAdjustments = await loadAdjustments(config.season);
    
    // Create final snapshot
    const snapshot = createSnapshot(ratings, allAdjustments, config);
    
    return NextResponse.json({
      success: true,
      message: `Processed ${gamesProcessed} new games`,
      lastCalculated: new Date().toISOString(),
      config: {
        hca: config.hca,
        closingSource: config.closingSource,
        season: config.season,
      },
      summary: {
        teamsCount: snapshot.ratings.length,
        gamesProcessed: snapshot.gamesProcessed,
        newGamesProcessed: gamesProcessed,
        gamesSkipped,
        topTeams: snapshot.ratings.slice(0, 10).map(r => ({
          team: r.teamName,
          rating: r.rating,
        })),
      },
      data: snapshot,
    });
    
  } catch (error) {
    console.error('[Calculate Ratings] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to calculate ratings',
    }, { status: 500 });
  }
}

/**
 * Find matching game in Odds API data
 * Checks both normal and swapped home/away (for neutral site games)
 * Uses override map for team name translations
 */
function findMatchingGame(
  espnGame: HistoricalGame, 
  oddsGames: OddsAPIGame[],
  oddsApiOverrideMap?: Map<string, string>
): OddsAPIGame | null {
  const espnHome = espnGame.homeTeam.toLowerCase();
  const espnAway = espnGame.awayTeam.toLowerCase();
  
  // Get override names if they exist
  const overrideHome = oddsApiOverrideMap?.get(espnHome);
  const overrideAway = oddsApiOverrideMap?.get(espnAway);
  
  for (const oddsGame of oddsGames) {
    const oddsHome = oddsGame.home_team.toLowerCase();
    const oddsAway = oddsGame.away_team.toLowerCase();
    
    // Check normal orientation (with override support)
    const homeMatch = teamsMatch(espnHome, oddsHome) || 
                      (overrideHome && teamsMatch(overrideHome, oddsHome));
    const awayMatch = teamsMatch(espnAway, oddsAway) || 
                      (overrideAway && teamsMatch(overrideAway, oddsAway));
    
    if (homeMatch && awayMatch) {
      if (overrideHome || overrideAway) {
        console.log(`[findMatchingGame] Matched via override: ESPN ${espnGame.homeTeam} vs ${espnGame.awayTeam}`);
      }
      return oddsGame;
    }
    
    // Check swapped orientation (common for neutral site tournaments)
    const swappedHomeMatch = teamsMatch(espnHome, oddsAway) || 
                             (overrideHome && teamsMatch(overrideHome, oddsAway));
    const swappedAwayMatch = teamsMatch(espnAway, oddsHome) || 
                             (overrideAway && teamsMatch(overrideAway, oddsHome));
    
    if (swappedHomeMatch && swappedAwayMatch) {
      console.log(`[findMatchingGame] Found swapped match: ESPN ${espnGame.homeTeam} vs ${espnGame.awayTeam} -> Odds API ${oddsGame.away_team} vs ${oddsGame.home_team}`);
      return oddsGame;
    }
  }
  
  return null;
}

/**
 * Check if two team names match (fuzzy)
 */
function teamsMatch(name1: string, name2: string): boolean {
  // Normalize common variations
  const normalize = (name: string) => {
    return name
      .replace(/\bst\b/g, 'state')           // "Oklahoma St" -> "Oklahoma State"
      .replace(/\bcsu\b/g, 'cal state')      // "CSU Northridge" -> "Cal State Northridge"
      .replace(/\buc\b/g, 'california')      // "UC Santa Barbara" -> "California Santa Barbara"
      .replace(/\busc\b/g, 'southern california') // Normalize USC
      .replace(/\bsmu\b/g, 'southern methodist')  // SMU -> Southern Methodist
      .replace(/\btcu\b/g, 'texas christian')     // TCU -> Texas Christian
      .replace(/\buab\b/g, 'alabama birmingham')  // UAB
      .replace(/\bucf\b/g, 'central florida')     // UCF
      .replace(/\bvcu\b/g, 'virginia commonwealth') // VCU
      .replace(/\butep\b/g, 'texas el paso')      // UTEP
      .replace(/\butsa\b/g, 'texas san antonio')  // UTSA
      .replace(/\bunlv\b/g, 'nevada las vegas')   // UNLV
      .replace(/\bstate state\b/g, 'state')  // Fix double "state state" if it happens
      .replace(/'/g, '')                     // Remove apostrophes: Hawai'i -> Hawaii
      .trim();
  };
  
  const n1 = normalize(name1);
  const n2 = normalize(name2);
  
  if (n1 === n2) return true;
  if (n1.includes(n2) || n2.includes(n1)) return true;
  
  const first1 = n1.split(' ')[0];
  const first2 = n2.split(' ')[0];
  if (first1.length > 3 && first1 === first2) return true;
  
  // Remove mascots and compare
  const mascotPattern = /(wildcats|bulldogs|tigers|bears|eagles|cardinals|blue devils|tar heels|wolverines|buckeyes|spartans|hoosiers|boilermakers|hawkeyes|jayhawks|longhorns|sooners|aggies|crimson tide|volunteers|gators|rebels|commodores|gamecocks|razorbacks|cavaliers|hokies|hurricanes|seminoles|yellow jackets|demon deacons|fighting irish|orange|panthers|wolfpack|terrapins|scarlet knights|nittany lions|golden gophers|cornhuskers|badgers|illini|cougars|huskies|ducks|beavers|trojans|bruins|sun devils|buffaloes|utes|aztecs|lobos|broncos|rams|falcons|knights|owls|monarchs|dukes|spiders|flyers|billikens|explorers|hawks|gaels|toreros|waves|pilots|lions|bearcats|musketeers|red storm|friars|hoyas|blue demons|golden eagles|pirates|johnnies|racers|lumberjacks|bonnies|cowboys|shockers|matadors|vandals|bengals|rainbow warriors|fighting hawks|redhawks|red wolves|bison|colonels|seawolves|dolphins|lancers|mountain hawks|gauchos|leopards|warriors|thunderbirds|bobcats)$/g;
  
  const clean1 = n1.replace(mascotPattern, '').trim();
  const clean2 = n2.replace(mascotPattern, '').trim();
  
  if (clean1 === clean2) return true;
  if (clean1.includes(clean2) || clean2.includes(clean1)) return true;
  
  return false;
}

/**
 * Handle recalculate action - replays all game adjustments to recalculate ratings
 * This is useful when you've added new team mappings and want to reprocess
 * without re-fetching from Odds API
 */
async function handleRecalculate(request: NextRequest, body: Record<string, unknown>) {
  const season = (body.season as number) || 2026;
  const hca = (body.hca as number) || DEFAULT_RATINGS_CONFIG.hca;
  
  console.log(`[Recalculate] Starting recalculation for season ${season}`);
  
  // Step 1: Load all existing adjustments (sorted by date)
  const adjustments = await loadAdjustments(season);
  
  if (adjustments.length === 0) {
    return NextResponse.json({
      success: false,
      error: 'No game adjustments found to recalculate',
    });
  }
  
  console.log(`[Recalculate] Found ${adjustments.length} game adjustments to replay`);
  
  // Step 2: Load current ratings and reset to initial values
  const ratings = await loadRatings(season);
  
  console.log(`[Recalculate] Resetting ${ratings.size} ratings to initial values`);
  
  for (const [, rating] of ratings) {
    rating.rating = rating.initialRating;
    rating.gamesProcessed = 0;
  }
  
  // Step 3: Replay each adjustment in chronological order and update records
  let gamesProcessed = 0;
  const updatedAdjustments: GameAdjustment[] = [];
  
  for (const adj of adjustments) {
    const homeRating = ratings.get(adj.homeTeam);
    const awayRating = ratings.get(adj.awayTeam);
    
    if (!homeRating || !awayRating) {
      console.warn(`[Recalculate] Skipping game ${adj.gameId}: team not found (${adj.homeTeam} vs ${adj.awayTeam})`);
      continue;
    }
    
    // Capture before ratings
    const homeRatingBefore = homeRating.rating;
    const awayRatingBefore = awayRating.rating;
    
    // Calculate projected spread based on current ratings
    const projectedSpread = awayRating.rating - homeRating.rating - (adj.isNeutralSite ? 0 : hca);
    
    // Calculate difference and adjustment
    const difference = adj.closingSpread - projectedSpread;
    const adjustment = difference / 2; // Half the difference applied to each team
    
    // Apply adjustments to ratings
    // When closing spread is LESS favorable to away team than projected,
    // away team rating should DECREASE and home team rating should INCREASE
    homeRating.rating -= adjustment;
    awayRating.rating += adjustment;
    homeRating.gamesProcessed++;
    awayRating.gamesProcessed++;
    
    // Create updated adjustment record with new before/after values
    updatedAdjustments.push({
      gameId: adj.gameId,
      date: adj.date,
      homeTeam: adj.homeTeam,
      awayTeam: adj.awayTeam,
      isNeutralSite: adj.isNeutralSite,
      projectedSpread,
      closingSpread: adj.closingSpread,
      closingSource: adj.closingSource,
      difference,
      adjustment,
      homeRatingBefore,
      homeRatingAfter: homeRating.rating,
      awayRatingBefore,
      awayRatingAfter: awayRating.rating,
    });
    
    gamesProcessed++;
  }
  
  console.log(`[Recalculate] Replayed ${gamesProcessed} games, saving updates...`);
  
  // Step 4: Save all updated ratings to Supabase
  for (const [, rating] of ratings) {
    await saveRating(rating, season);
  }
  
  // Step 5: Save all updated adjustment records
  console.log(`[Recalculate] Updating ${updatedAdjustments.length} adjustment records...`);
  for (const adj of updatedAdjustments) {
    await saveGameAdjustment(adj, season);
  }
  
  console.log(`[Recalculate] Complete!`);

  return NextResponse.json({
    success: true,
    message: `Recalculated ratings from ${gamesProcessed} games`,
    gamesProcessed,
  });
}

/**
 * Handle recalculate-from action - replays all adjustments but only saves
 * changes from the specified date forward. Much faster than full recalculate.
 */
async function handleRecalculateFrom(body: Record<string, unknown>) {
  const season = (body.season as number) || 2026;
  const hca = (body.hca as number) || DEFAULT_RATINGS_CONFIG.hca;
  const fromDate = body.fromDate as string;

  if (!fromDate || !/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
    return NextResponse.json({
      success: false,
      error: 'fromDate is required (YYYY-MM-DD)',
    }, { status: 400 });
  }

  console.log(`[RecalculateFrom] Starting partial recalculation from ${fromDate} for season ${season}`);

  // Step 1: Load all adjustments (sorted by date)
  const adjustments = await loadAdjustments(season);

  if (adjustments.length === 0) {
    return NextResponse.json({
      success: false,
      error: 'No game adjustments found',
    });
  }

  // Step 2: Load ratings and reset to initial values
  const ratings = await loadRatings(season);

  for (const [, rating] of ratings) {
    rating.rating = rating.initialRating;
    rating.gamesProcessed = 0;
  }

  // Step 3: Replay all adjustments, but only save from fromDate forward
  // Compare using date strings (YYYY-MM-DD) to avoid timezone issues

  let gamesReplayed = 0;
  let gamesSaved = 0;

  for (const adj of adjustments) {
    const homeRating = ratings.get(adj.homeTeam);
    const awayRating = ratings.get(adj.awayTeam);

    if (!homeRating || !awayRating) {
      continue;
    }

    const homeRatingBefore = homeRating.rating;
    const awayRatingBefore = awayRating.rating;

    const projectedSpread = awayRating.rating - homeRating.rating - (adj.isNeutralSite ? 0 : hca);
    const difference = adj.closingSpread - projectedSpread;
    const adjustment = difference / 2;

    homeRating.rating -= adjustment;
    awayRating.rating += adjustment;
    homeRating.gamesProcessed++;
    awayRating.gamesProcessed++;

    gamesReplayed++;

    // Only save adjustments from the target date forward
    const adjDateStr = adj.date.substring(0, 10); // Extract YYYY-MM-DD
    if (adjDateStr >= fromDate) {
      console.log(`[RecalculateFrom] Saving ${adj.awayTeam} @ ${adj.homeTeam} (${adjDateStr}): close=${adj.closingSpread}, proj=${projectedSpread.toFixed(2)}, diff=${difference.toFixed(2)}, adj=${adjustment.toFixed(2)}`);
      const updatedAdj: GameAdjustment = {
        gameId: adj.gameId,
        date: adj.date,
        homeTeam: adj.homeTeam,
        awayTeam: adj.awayTeam,
        isNeutralSite: adj.isNeutralSite,
        projectedSpread,
        closingSpread: adj.closingSpread,
        closingSource: adj.closingSource,
        difference,
        adjustment,
        homeRatingBefore,
        homeRatingAfter: homeRating.rating,
        awayRatingBefore,
        awayRatingAfter: awayRating.rating,
      };

      await saveGameAdjustment(updatedAdj, season);
      gamesSaved++;
    }
  }

  // Step 4: Save all ratings (they all need updating since changes cascade)
  for (const [, rating] of ratings) {
    await saveRating(rating, season);
  }

  console.log(`[RecalculateFrom] Complete! Replayed ${gamesReplayed} games, saved ${gamesSaved} adjustments from ${fromDate} forward`);

  return NextResponse.json({
    success: true,
    message: `Recalculated from ${fromDate}: ${gamesSaved} adjustments updated`,
    gamesReplayed,
    gamesSaved,
  });
}
