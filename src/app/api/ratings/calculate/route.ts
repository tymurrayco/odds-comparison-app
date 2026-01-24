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
  US_AVERAGE_BOOKMAKER_KEYS,
  ODDS_API_BASE_URL,
  NCAAB_SPORT_KEY,
} from '@/lib/ratings/constants';
import {
  processGame,
  extractClosingSpread,
  createSnapshot,
} from '@/lib/ratings/engine';
import { fuzzyMatchTeam, findTeamByName } from '@/lib/ratings/team-mapping';
import { HistoricalGame } from '../games/route';
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
      
      // Fetch from KenPom
      const kenpomResponse = await fetch(
        `${getBaseUrl(request)}/api/ratings/kenpom?type=archive&date=${FINAL_RATINGS_DATE[config.previousSeason]}`,
        { cache: 'no-store' }
      );
      
      if (!kenpomResponse.ok) {
        const error = await kenpomResponse.json();
        return NextResponse.json({
          success: false,
          error: `Failed to fetch KenPom ratings: ${error.error || kenpomResponse.status}`,
        }, { status: 500 });
      }
      
      const kenpomData = await kenpomResponse.json();
      const kenpomRatings: KenPomRating[] = kenpomData.data;
      
      if (!kenpomRatings || kenpomRatings.length === 0) {
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
    
    // Step 3: Fetch completed games from ESPN
    const seasonStart = SEASON_DATES[config.season].start;
    const today = new Date().toISOString().split('T')[0];
    
    // Use provided date range or defaults
    const queryStartDate = startDate || seasonStart;
    const queryEndDate = endDate || today;
    
    const gamesResponse = await fetch(
      `${getBaseUrl(request)}/api/ratings/games?startDate=${queryStartDate}&endDate=${queryEndDate}&limit=${maxGames + processedGameIds.size}`,
      { cache: 'no-store' }
    );
    
    if (!gamesResponse.ok) {
      console.warn('[Calculate Ratings] Failed to fetch games from ESPN');
      // Return current state
      const adjustments = await loadAdjustments(config.season);
      const snapshot = createSnapshot(ratings, adjustments, config);
      return NextResponse.json({
        success: true,
        message: 'Returned existing ratings (ESPN fetch failed)',
        data: snapshot,
      });
    }
    
    const gamesData = await gamesResponse.json();
    const allGames: HistoricalGame[] = gamesData.games || [];
    
    // Filter to only unprocessed games
    const newGames = allGames.filter(g => !processedGameIds.has(g.id));
    console.log(`[Calculate Ratings] ${newGames.length} new games to process`);
    
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
    console.log(`[Calculate Ratings] Loaded ${overrideMap.size} team overrides`);
    
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
      
      for (const game of gamesToProcess) {
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
          
          if (cached && cached.closing_source === config.closingSource) {
            closingSpread = cached.closing_spread;
            bookmakers = cached.bookmakers || [];
          } else {
            // Fetch from Odds API
            const gameTime = new Date(game.date);
            const closingTime = new Date(gameTime.getTime() - 5 * 60 * 1000);
            const closingTimeStr = closingTime.toISOString().replace('.000Z', 'Z');
            
            const regions = config.closingSource === 'pinnacle' ? 'eu' : 'us';
            const bookmakersParam = config.closingSource === 'pinnacle' 
              ? 'pinnacle' 
              : US_AVERAGE_BOOKMAKER_KEYS.join(',');
            
            const oddsUrl = `${ODDS_API_BASE_URL}/historical/sports/${NCAAB_SPORT_KEY}/odds?` +
              `apiKey=${oddsApiKey}&regions=${regions}&markets=spreads&oddsFormat=american` +
              `&date=${closingTimeStr}&bookmakers=${bookmakersParam}`;
            
            const oddsResponse = await fetch(oddsUrl);
            
            if (!oddsResponse.ok) {
              matchingLog.status = 'no_odds';
              matchingLog.skipReason = `Odds API error: ${oddsResponse.status}`;
              await saveMatchingLog(matchingLog, config.season);
              gamesSkipped++;
              continue;
            }
            
            const oddsData = await oddsResponse.json();
            const oddsGames: OddsAPIGame[] = oddsData.data || [];
            
            // Find matching game
            const matchingOddsGame = findMatchingGame(game, oddsGames);
            
            if (!matchingOddsGame) {
              matchingLog.status = 'no_odds';
              matchingLog.skipReason = 'No matching game in Odds API';
              await saveMatchingLog(matchingLog, config.season);
              gamesSkipped++;
              continue;
            }
            
            // Extract spread
            const closingLine = extractClosingSpread(
              matchingOddsGame,
              config.closingSource,
              US_AVERAGE_BOOKMAKER_KEYS
            );
            
            if (closingLine.spread === null) {
              matchingLog.status = 'no_spread';
              matchingLog.skipReason = 'No spread data available';
              await saveMatchingLog(matchingLog, config.season);
              gamesSkipped++;
              continue;
            }
            
            closingSpread = closingLine.spread;
            bookmakers = closingLine.bookmakers;
            
            // Cache it
            await cacheClosingLine(
              game.id,
              matchingOddsGame.id,
              game.date,
              game.homeTeam,
              game.awayTeam,
              closingSpread,
              config.closingSource,
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
 * Get base URL for internal API calls
 */
function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${host}`;
}

/**
 * Find matching game in Odds API data
 */
function findMatchingGame(espnGame: HistoricalGame, oddsGames: OddsAPIGame[]): OddsAPIGame | null {
  const espnHome = espnGame.homeTeam.toLowerCase();
  const espnAway = espnGame.awayTeam.toLowerCase();
  
  for (const oddsGame of oddsGames) {
    const oddsHome = oddsGame.home_team.toLowerCase();
    const oddsAway = oddsGame.away_team.toLowerCase();
    
    const homeMatch = teamsMatch(espnHome, oddsHome);
    const awayMatch = teamsMatch(espnAway, oddsAway);
    
    if (homeMatch && awayMatch) {
      return oddsGame;
    }
  }
  
  return null;
}

/**
 * Check if two team names match (fuzzy)
 */
function teamsMatch(name1: string, name2: string): boolean {
  if (name1 === name2) return true;
  if (name1.includes(name2) || name2.includes(name1)) return true;
  
  const first1 = name1.split(' ')[0];
  const first2 = name2.split(' ')[0];
  if (first1.length > 3 && first1 === first2) return true;
  
  // Remove mascots and compare
  const clean1 = name1.replace(/(wildcats|bulldogs|tigers|bears|eagles|cardinals|blue devils|tar heels|wolverines|buckeyes|spartans|hoosiers|boilermakers|hawkeyes|jayhawks|longhorns|sooners|aggies|crimson tide|volunteers|gators|rebels|commodores|gamecocks|razorbacks|cavaliers|hokies|hurricanes|seminoles|yellow jackets|demon deacons|fighting irish|orange|panthers|wolfpack|terrapins|scarlet knights|nittany lions|golden gophers|cornhuskers|badgers|illini|cougars|huskies|ducks|beavers|trojans|bruins|sun devils|buffaloes|utes|aztecs|lobos|broncos|rams|falcons|knights|owls|monarchs|dukes|spiders|flyers|billikens|explorers|hawks|gaels|toreros|waves|pilots|lions|bearcats|musketeers|red storm|friars|hoyas|blue demons|golden eagles|pirates|johnnies|racers|lumberjacks|bonnies)$/g, '').trim();
  const clean2 = name2.replace(/(wildcats|bulldogs|tigers|bears|eagles|cardinals|blue devils|tar heels|wolverines|buckeyes|spartans|hoosiers|boilermakers|hawkeyes|jayhawks|longhorns|sooners|aggies|crimson tide|volunteers|gators|rebels|commodores|gamecocks|razorbacks|cavaliers|hokies|hurricanes|seminoles|yellow jackets|demon deacons|fighting irish|orange|panthers|wolfpack|terrapins|scarlet knights|nittany lions|golden gophers|cornhuskers|badgers|illini|cougars|huskies|ducks|beavers|trojans|bruins|sun devils|buffaloes|utes|aztecs|lobos|broncos|rams|falcons|knights|owls|monarchs|dukes|spiders|flyers|billikens|explorers|hawks|gaels|toreros|waves|pilots|lions|bearcats|musketeers|red storm|friars|hoyas|blue demons|golden eagles|pirates|johnnies|racers|lumberjacks|bonnies)$/g, '').trim();
  
  if (clean1 === clean2) return true;
  if (clean1.includes(clean2) || clean2.includes(clean1)) return true;
  
  return false;
}
