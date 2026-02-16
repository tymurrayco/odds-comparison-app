// src/app/api/lacrosse/calculate/route.ts

import { NextRequest, NextResponse } from 'next/server';
import {
  ClosingLineSource,
  RatingsSnapshot,
  GameAdjustment,
  RatingsConfig,
} from '@/lib/lacrosse/types';
import {
  DEFAULT_LACROSSE_CONFIG,
  LACROSSE_SPORT_KEY,
  LACROSSE_SEASON_DATES,
} from '@/lib/lacrosse/constants';
import {
  projectSpread,
  calculateAdjustment,
} from '@/lib/ratings/engine';
import {
  loadRatings,
  saveRating,
  loadAdjustments,
  loadConfig,
  saveConfig,
  getStats,
  getProcessedGameIds,
  saveGameAdjustment,
  loadTeamOverrides,
} from '@/lib/lacrosse/supabase';

// ============================================================================
// Types
// ============================================================================

interface OddsAPIOutcome {
  name: string;
  price: number;
  point?: number;
}

interface OddsAPIMarket {
  key: string;
  last_update: string;
  outcomes: OddsAPIOutcome[];
}

interface OddsAPIBookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: OddsAPIMarket[];
}

interface OddsAPIGame {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsAPIBookmaker[];
}

interface ESPNCompetitor {
  homeAway: 'home' | 'away';
  team?: { displayName?: string; name?: string; abbreviation?: string };
  score?: string;
  winner?: boolean;
}

interface ESPNCompetition {
  id: string;
  date: string;
  competitors?: ESPNCompetitor[];
  venue?: { fullName?: string; neutral?: boolean };
  neutralSite?: boolean;
  status?: { type?: { state?: string; completed?: boolean } };
}

interface ESPNEvent {
  id: string;
  date: string;
  name?: string;
  competitions?: ESPNCompetition[];
}

interface HistoricalGame {
  id: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  isCompleted: boolean;
  isNeutralSite: boolean;
}

// ============================================================================
// ESPN Fetching
// ============================================================================

function formatDateForESPN(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

async function fetchGamesForDate(date: Date): Promise<HistoricalGame[]> {
  const dateStr = formatDateForESPN(date);
  const apiUrl = `https://site.api.espn.com/apis/site/v2/sports/lacrosse/mens-college-lacrosse/scoreboard?dates=${dateStr}&limit=200`;

  try {
    const response = await fetch(apiUrl, { next: { revalidate: 3600 } });

    if (!response.ok) {
      console.error(`[Lacrosse ESPN] API error for ${dateStr}:`, response.status);
      return [];
    }

    const data = await response.json();
    const games: HistoricalGame[] = [];

    if (data.events && Array.isArray(data.events)) {
      for (const event of data.events as ESPNEvent[]) {
        const competition = event.competitions?.[0];
        if (!competition) continue;

        const competitors = competition.competitors || [];
        const homeTeam = competitors.find(c => c.homeAway === 'home');
        const awayTeam = competitors.find(c => c.homeAway === 'away');

        if (!homeTeam || !awayTeam) continue;

        const isCompleted = competition.status?.type?.completed === true ||
                           competition.status?.type?.state === 'post';

        const isNeutralSite = competition.neutralSite === true ||
                             competition.venue?.neutral === true;

        games.push({
          id: event.id,
          date: competition.date || event.date,
          homeTeam: homeTeam.team?.displayName || homeTeam.team?.name || 'Unknown',
          awayTeam: awayTeam.team?.displayName || awayTeam.team?.name || 'Unknown',
          isCompleted,
          isNeutralSite,
        });
      }
    }

    return games;
  } catch (error) {
    console.error(`[Lacrosse ESPN] Error fetching ${dateStr}:`, error);
    return [];
  }
}

async function fetchHistoricalGames(
  startDateStr: string,
  endDateStr: string,
  limit: number
): Promise<HistoricalGame[]> {
  const startDate = parseDate(startDateStr);
  const endDate = parseDate(endDateStr);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return [];

  const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  if (daysDiff > 120) {
    console.error('[Lacrosse ESPN] Date range too large:', daysDiff, 'days');
    return [];
  }

  console.log(`[Lacrosse ESPN] Fetching games from ${startDateStr} to ${endDateStr}`);

  const allGames: HistoricalGame[] = [];
  const currentDate = new Date(startDate);
  let daysProcessed = 0;

  while (currentDate <= endDate && allGames.length < limit) {
    const dayGames = await fetchGamesForDate(currentDate);
    const completedGames = dayGames.filter(g => g.isCompleted);
    allGames.push(...completedGames);

    daysProcessed++;
    currentDate.setDate(currentDate.getDate() + 1);

    if (daysProcessed % 10 === 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  allGames.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  console.log(`[Lacrosse ESPN] Found ${allGames.length} completed games over ${daysProcessed} days`);
  return allGames.slice(0, limit);
}

// ============================================================================
// Team Name Matching
// ============================================================================

function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\bst\b\.?/g, 'state')
    .replace(/'/g, '')
    .replace(/\./g, '')
    .trim();
}

function teamsMatch(name1: string, name2: string): boolean {
  const n1 = normalizeTeamName(name1);
  const n2 = normalizeTeamName(name2);

  if (n1 === n2) return true;
  if (n1.includes(n2) || n2.includes(n1)) return true;

  // Compare first significant word
  const first1 = n1.split(' ')[0];
  const first2 = n2.split(' ')[0];
  if (first1.length > 3 && first1 === first2) return true;

  return false;
}

function findMatchingOddsGame(
  espnGame: HistoricalGame,
  oddsGames: OddsAPIGame[],
  overrideMap: Map<string, string>
): { game: OddsAPIGame; swapped: boolean } | null {
  const espnHome = espnGame.homeTeam.toLowerCase();
  const espnAway = espnGame.awayTeam.toLowerCase();

  const overrideHome = overrideMap.get(espnHome);
  const overrideAway = overrideMap.get(espnAway);

  for (const oddsGame of oddsGames) {
    const oddsHome = oddsGame.home_team.toLowerCase();
    const oddsAway = oddsGame.away_team.toLowerCase();

    // Normal orientation
    const homeMatch = teamsMatch(espnHome, oddsHome) ||
                      (overrideHome ? teamsMatch(overrideHome, oddsHome) : false);
    const awayMatch = teamsMatch(espnAway, oddsAway) ||
                      (overrideAway ? teamsMatch(overrideAway, oddsAway) : false);

    if (homeMatch && awayMatch) return { game: oddsGame, swapped: false };

    // Swapped orientation (neutral site games)
    const swappedHome = teamsMatch(espnHome, oddsAway) ||
                        (overrideHome ? teamsMatch(overrideHome, oddsAway) : false);
    const swappedAway = teamsMatch(espnAway, oddsHome) ||
                        (overrideAway ? teamsMatch(overrideAway, oddsHome) : false);

    if (swappedHome && swappedAway) {
      console.log(`[Lacrosse] Swapped match: ESPN ${espnGame.homeTeam} vs ${espnGame.awayTeam}`);
      return { game: oddsGame, swapped: true };
    }
  }

  return null;
}

function extractClosingSpread(
  game: OddsAPIGame,
  source: ClosingLineSource,
  usBooks: string[]
): { spread: number | null; bookmakers: string[] } {
  if (!game.bookmakers || game.bookmakers.length === 0) {
    return { spread: null, bookmakers: [] };
  }

  if (source === 'pinnacle') {
    const pinnacle = game.bookmakers.find(b => b.key === 'pinnacle');
    if (pinnacle) {
      const spreadsMarket = pinnacle.markets.find(m => m.key === 'spreads');
      if (spreadsMarket) {
        const homeOutcome = spreadsMarket.outcomes.find(o => o.name === game.home_team);
        if (homeOutcome?.point !== undefined) {
          return { spread: homeOutcome.point, bookmakers: ['pinnacle'] };
        }
      }
    }
  }

  // US average
  const spreads: number[] = [];
  const usedBooks: string[] = [];

  for (const bookKey of usBooks) {
    const bookmaker = game.bookmakers.find(b => b.key === bookKey);
    if (bookmaker) {
      const spreadsMarket = bookmaker.markets.find(m => m.key === 'spreads');
      if (spreadsMarket) {
        const homeOutcome = spreadsMarket.outcomes.find(o => o.name === game.home_team);
        if (homeOutcome?.point !== undefined) {
          spreads.push(homeOutcome.point);
          usedBooks.push(bookmaker.title || bookKey);
        }
      }
    }
  }

  if (spreads.length > 0) {
    const average = spreads.reduce((a, b) => a + b, 0) / spreads.length;
    return { spread: Math.round(average * 10) / 10, bookmakers: usedBooks };
  }

  return { spread: null, bookmakers: [] };
}

// ============================================================================
// Route Handlers
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const season = parseInt(searchParams.get('season') || '2026');

    const [ratings, adjustments, config, stats] = await Promise.all([
      loadRatings(season),
      loadAdjustments(season),
      loadConfig(),
      getStats(season),
    ]);

    if (ratings.size === 0) {
      return NextResponse.json({
        success: false,
        error: 'No ratings found. Import a Massey CSV first.',
        hint: 'POST /api/lacrosse/import-ratings with { csvText: "..." }',
      });
    }

    const snapshot: RatingsSnapshot = {
      asOfDate: new Date().toISOString(),
      season,
      hca: config?.hca || DEFAULT_LACROSSE_CONFIG.hca,
      closingSource: (config?.closing_source as ClosingLineSource) || DEFAULT_LACROSSE_CONFIG.closingSource,
      gamesProcessed: stats.gamesProcessed,
      ratings: Array.from(ratings.values()).sort((a, b) => b.rating - a.rating),
      adjustments,
    };

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
    });
  } catch (error) {
    console.error('[Lacrosse Calculate] GET error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load ratings',
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    // Handle recalculate action
    if (body.action === 'recalculate') {
      return await handleRecalculate(body);
    }

    const config: RatingsConfig = {
      ...DEFAULT_LACROSSE_CONFIG,
      hca: body.hca ?? DEFAULT_LACROSSE_CONFIG.hca,
      closingSource: body.closingSource ?? DEFAULT_LACROSSE_CONFIG.closingSource,
    };

    const maxGames = body.maxGames ?? 200;
    const startDate = body.startDate as string | undefined;
    const endDate = body.endDate as string | undefined;

    console.log('[Lacrosse Sync] Starting with config:', config);

    // Step 1: Load existing ratings
    const ratings = await loadRatings(config.season);

    if (ratings.size === 0) {
      return NextResponse.json({
        success: false,
        error: 'No ratings found. Import a Massey CSV first.',
      }, { status: 400 });
    }

    console.log(`[Lacrosse Sync] Loaded ${ratings.size} ratings`);

    // Step 2: Get already processed games
    const processedGameIds = await getProcessedGameIds(config.season);
    console.log(`[Lacrosse Sync] ${processedGameIds.size} games already processed`);

    // Step 3: Fetch completed games from ESPN
    const seasonDates = LACROSSE_SEASON_DATES[config.season];
    const today = new Date().toISOString().split('T')[0];
    const queryStartDate = startDate || seasonDates?.start || '2026-02-07';
    const queryEndDate = endDate || today;

    const allGames = await fetchHistoricalGames(
      queryStartDate,
      queryEndDate,
      maxGames + processedGameIds.size
    );

    // Filter to only unprocessed games
    const newGames = allGames.filter(g => !processedGameIds.has(g.id));
    console.log(`[Lacrosse Sync] ${allGames.length} total ESPN games, ${newGames.length} new`);

    if (newGames.length === 0) {
      const adjustments = await loadAdjustments(config.season);
      return NextResponse.json({
        success: true,
        message: 'No new games to process',
        summary: { teamsCount: ratings.size, gamesProcessed: processedGameIds.size, newGamesProcessed: 0, gamesSkipped: 0 },
      });
    }

    // Step 4: Build team name override map (ESPN name → Odds API name)
    const overrides = await loadTeamOverrides();
    const espnToOddsApi = new Map<string, string>();
    for (const o of overrides) {
      if (o.oddsApiName) {
        espnToOddsApi.set(o.sourceName.toLowerCase(), o.oddsApiName.toLowerCase());
        if (o.espnName) {
          espnToOddsApi.set(o.espnName.toLowerCase(), o.oddsApiName.toLowerCase());
        }
      }
    }

    // Also build ESPN name → Massey name for rating lookup
    const espnToMassey = new Map<string, string>();
    for (const o of overrides) {
      espnToMassey.set(o.sourceName.toLowerCase(), o.masseyName);
      if (o.espnName) {
        espnToMassey.set(o.espnName.toLowerCase(), o.masseyName);
      }
    }

    console.log(`[Lacrosse Sync] ${espnToOddsApi.size} Odds API overrides, ${espnToMassey.size} Massey overrides`);

    // Step 5: Process games with Odds API closing lines
    const oddsApiKey = process.env.ODDS_API_KEY;
    const newAdjustments: GameAdjustment[] = [];
    let gamesProcessed = 0;
    let gamesSkipped = 0;

    // Build ratings lookup for team matching
    const ratingsLookup = new Map<string, number>();
    for (const [name, rating] of ratings) {
      ratingsLookup.set(name, rating.rating);
    }

    // Helper: find team in ratings (ESPN name → Massey/ratings name)
    const findTeamInRatings = (espnName: string): { name: string; rating: number } | null => {
      // Check override first
      const masseyName = espnToMassey.get(espnName.toLowerCase());
      if (masseyName && ratingsLookup.has(masseyName)) {
        return { name: masseyName, rating: ratingsLookup.get(masseyName)! };
      }
      // Try direct match
      if (ratingsLookup.has(espnName)) {
        return { name: espnName, rating: ratingsLookup.get(espnName)! };
      }
      // Fuzzy: try normalized matching against all rating keys
      const normalized = normalizeTeamName(espnName);
      for (const [name, rating] of ratingsLookup) {
        if (normalizeTeamName(name) === normalized) {
          return { name, rating };
        }
        // Partial match: ESPN "Duke Blue Devils" contains Massey "Duke"
        if (normalized.includes(normalizeTeamName(name)) || normalizeTeamName(name).includes(normalized)) {
          return { name, rating };
        }
      }
      return null;
    };

    if (!oddsApiKey) {
      console.warn('[Lacrosse Sync] No ODDS_API_KEY set, skipping odds fetch');
      gamesSkipped = newGames.length;
    } else {
      const gamesToProcess = newGames.slice(0, maxGames);
      const US_BOOKS = ['draftkings', 'fanduel', 'betmgm', 'betrivers'];

      // Cache Odds API responses by hour
      const oddsCache = new Map<string, OddsAPIGame[]>();

      console.log(`[Lacrosse Sync] Processing ${gamesToProcess.length} games...`);

      for (let i = 0; i < gamesToProcess.length; i++) {
        const game = gamesToProcess[i];

        if (processedGameIds.has(game.id)) continue;

        if (i % 10 === 0) {
          console.log(`[Lacrosse Sync] Game ${i + 1}/${gamesToProcess.length}: ${game.awayTeam} @ ${game.homeTeam}`);
        }

        try {
          // Find both teams in ratings
          const homeMatch = findTeamInRatings(game.homeTeam);
          const awayMatch = findTeamInRatings(game.awayTeam);

          if (!homeMatch || !awayMatch) {
            if (!homeMatch) console.log(`[Lacrosse Sync] Home not found: "${game.homeTeam}"`);
            if (!awayMatch) console.log(`[Lacrosse Sync] Away not found: "${game.awayTeam}"`);
            gamesSkipped++;
            continue;
          }

          // Fetch odds from Odds API (with hourly caching)
          const gameTime = new Date(game.date);
          const closingTime = new Date(gameTime.getTime() - 5 * 60 * 1000);
          const closingTimeStr = closingTime.toISOString().replace('.000Z', 'Z');

          const cacheKeyTime = new Date(closingTime);
          cacheKeyTime.setMinutes(0, 0, 0);
          const cacheKey = cacheKeyTime.toISOString().replace('.000Z', 'Z');

          let oddsGames = oddsCache.get(cacheKey);

          if (oddsGames === undefined) {
            const url = `https://api.the-odds-api.com/v4/historical/sports/${LACROSSE_SPORT_KEY}/odds?` +
              `apiKey=${oddsApiKey}&regions=us,eu&markets=spreads&oddsFormat=american` +
              `&date=${closingTimeStr}&bookmakers=${['pinnacle', ...US_BOOKS].join(',')}`;

            const response = await fetch(url);

            if (!response.ok) {
              console.warn(`[Lacrosse Sync] Odds API ${response.status} for ${cacheKey}`);
              oddsGames = [];
            } else {
              const data = await response.json();
              oddsGames = (data.data || []) as OddsAPIGame[];
            }

            oddsCache.set(cacheKey, oddsGames);
          }

          // Find matching odds game
          const oddsMatch = findMatchingOddsGame(game, oddsGames, espnToOddsApi);

          if (!oddsMatch) {
            const oddsTeams = oddsGames.map(g => `${g.away_team} @ ${g.home_team}`);
            console.log(`[Lacrosse Sync] No odds match: ${game.awayTeam} @ ${game.homeTeam} (${game.date.substring(0, 10)})`);
            console.log(`[Lacrosse Sync]   Odds API had ${oddsGames.length} games: ${oddsTeams.join(' | ')}`);
            gamesSkipped++;
            continue;
          }

          // Extract closing spread (from Odds API home team's perspective)
          const closingLine = extractClosingSpread(oddsMatch.game, config.closingSource, US_BOOKS);

          // If home/away were swapped between ESPN and Odds API, negate the spread
          // so it's always from the ESPN home team's perspective
          if (oddsMatch.swapped && closingLine.spread !== null) {
            closingLine.spread = -closingLine.spread;
          }

          if (closingLine.spread === null) {
            console.log(`[Lacrosse Sync] No spread data: ${game.awayTeam} @ ${game.homeTeam} (${game.date.substring(0, 10)}) - books checked: ${closingLine.bookmakers.length}`);
            gamesSkipped++;
            continue;
          }

          // Get current ratings
          const homeRating = ratings.get(homeMatch.name);
          const awayRating = ratings.get(awayMatch.name);

          if (!homeRating || !awayRating) {
            gamesSkipped++;
            continue;
          }

          // Calculate projected spread
          const projectedSpread = projectSpread(
            homeRating.rating,
            awayRating.rating,
            config.hca,
            game.isNeutralSite
          );

          // Calculate adjustment
          const difference = closingLine.spread - projectedSpread;
          const adj = calculateAdjustment(projectedSpread, closingLine.spread);

          // Store before values
          const homeRatingBefore = homeRating.rating;
          const awayRatingBefore = awayRating.rating;

          // Apply adjustment (same logic as engine.applyAdjustment)
          const roundTo2 = (v: number) => Math.round(v * 100) / 100;
          awayRating.rating = roundTo2(awayRating.rating + adj);
          awayRating.gamesProcessed += 1;
          awayRating.lastUpdated = new Date().toISOString();

          homeRating.rating = roundTo2(homeRating.rating - adj);
          homeRating.gamesProcessed += 1;
          homeRating.lastUpdated = new Date().toISOString();

          // Update lookup for subsequent games
          ratingsLookup.set(homeMatch.name, homeRating.rating);
          ratingsLookup.set(awayMatch.name, awayRating.rating);

          const gameAdjustment: GameAdjustment = {
            gameId: game.id,
            date: game.date,
            homeTeam: homeMatch.name,
            awayTeam: awayMatch.name,
            isNeutralSite: game.isNeutralSite,
            homeRatingBefore,
            awayRatingBefore,
            projectedSpread,
            closingSpread: closingLine.spread,
            closingSource: config.closingSource,
            difference: roundTo2(difference),
            adjustment: adj,
            homeRatingAfter: homeRating.rating,
            awayRatingAfter: awayRating.rating,
          };

          // Save to Supabase
          processedGameIds.add(game.id);
          await saveGameAdjustment(gameAdjustment, config.season);
          await saveRating(homeRating, config.season);
          await saveRating(awayRating, config.season);

          newAdjustments.push(gameAdjustment);
          gamesProcessed++;

          await new Promise(resolve => setTimeout(resolve, 50));

        } catch (err) {
          console.warn(`[Lacrosse Sync] Error processing game ${game.id}:`, err);
          gamesSkipped++;
        }
      }
    }

    console.log(`[Lacrosse Sync] Done: ${gamesProcessed} processed, ${gamesSkipped} skipped`);

    // Save config
    await saveConfig(config.hca, config.closingSource, config.season, today);

    // Load all adjustments for final snapshot
    const allAdjustments = await loadAdjustments(config.season);

    const snapshot: RatingsSnapshot = {
      asOfDate: new Date().toISOString(),
      season: config.season,
      hca: config.hca,
      closingSource: config.closingSource,
      gamesProcessed: allAdjustments.length,
      ratings: Array.from(ratings.values()).sort((a, b) => b.rating - a.rating),
      adjustments: allAdjustments,
    };

    return NextResponse.json({
      success: true,
      message: `Processed ${gamesProcessed} new games`,
      lastCalculated: new Date().toISOString(),
      config: { hca: config.hca, closingSource: config.closingSource, season: config.season },
      summary: {
        teamsCount: snapshot.ratings.length,
        gamesProcessed: snapshot.gamesProcessed,
        newGamesProcessed: gamesProcessed,
        gamesSkipped,
      },
      data: snapshot,
    });

  } catch (error) {
    console.error('[Lacrosse Sync] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to sync ratings',
    }, { status: 500 });
  }
}

// ============================================================================
// Recalculate — replay all adjustments from initial ratings
// ============================================================================

async function handleRecalculate(body: Record<string, unknown>) {
  const season = (body.season as number) || 2026;
  const hca = (body.hca as number) || DEFAULT_LACROSSE_CONFIG.hca;

  console.log(`[Lacrosse Recalculate] Starting for season ${season}`);

  const adjustments = await loadAdjustments(season);

  if (adjustments.length === 0) {
    return NextResponse.json({ success: false, error: 'No adjustments to recalculate' });
  }

  const ratings = await loadRatings(season);

  // Reset to initial
  for (const [, rating] of ratings) {
    rating.rating = rating.initialRating;
    rating.gamesProcessed = 0;
  }

  let gamesProcessed = 0;
  const roundTo2 = (v: number) => Math.round(v * 100) / 100;

  for (const adj of adjustments) {
    const homeRating = ratings.get(adj.homeTeam);
    const awayRating = ratings.get(adj.awayTeam);

    if (!homeRating || !awayRating) continue;

    const homeRatingBefore = homeRating.rating;
    const awayRatingBefore = awayRating.rating;

    const projectedSpread = projectSpread(homeRating.rating, awayRating.rating, hca, adj.isNeutralSite);
    const difference = adj.closingSpread - projectedSpread;
    const adjustment = difference / 2;

    homeRating.rating = roundTo2(homeRating.rating - adjustment);
    awayRating.rating = roundTo2(awayRating.rating + adjustment);
    homeRating.gamesProcessed++;
    awayRating.gamesProcessed++;

    const updatedAdj: GameAdjustment = {
      ...adj,
      projectedSpread,
      difference: roundTo2(difference),
      adjustment: roundTo2(adjustment),
      homeRatingBefore,
      homeRatingAfter: homeRating.rating,
      awayRatingBefore,
      awayRatingAfter: awayRating.rating,
    };

    await saveGameAdjustment(updatedAdj, season);
    gamesProcessed++;
  }

  // Save all ratings
  for (const [, rating] of ratings) {
    await saveRating(rating, season);
  }

  console.log(`[Lacrosse Recalculate] Done: ${gamesProcessed} games replayed`);

  return NextResponse.json({
    success: true,
    message: `Recalculated from ${gamesProcessed} games`,
    gamesProcessed,
  });
}
