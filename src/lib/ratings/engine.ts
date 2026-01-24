// src/lib/ratings/engine.ts

/**
 * Power Ratings Engine
 * 
 * Core logic for:
 * 1. Projecting spreads from ratings
 * 2. Adjusting ratings based on market feedback
 * 3. Processing games chronologically
 */

import {
  TeamRating,
  GameAdjustment,
  RatingsSnapshot,
  RatingsConfig,
  ClosingLineSource,
  ClosingLineResult,
  ProjectionResult,
  KenPomRating,
  OddsAPIGame,
} from './types';
import { DEFAULT_RATINGS_CONFIG, RATINGS_DECIMAL_PLACES, SPREAD_DECIMAL_PLACES } from './constants';
import { findTeamByName } from './team-mapping';

// ============================================
// Rating Initialization
// ============================================

/**
 * Initialize ratings from KenPom data
 */
export function initializeRatings(
  kenpomRatings: KenPomRating[]
): Map<string, TeamRating> {
  const ratings = new Map<string, TeamRating>();
  const now = new Date().toISOString();
  
  for (const kp of kenpomRatings) {
    const rating: TeamRating = {
      teamName: kp.TeamName,
      kenpomName: kp.TeamName,
      rating: kp.AdjEM,
      initialRating: kp.AdjEM,
      gamesProcessed: 0,
      lastUpdated: now,
      conference: kp.ConfShort,
    };
    
    ratings.set(kp.TeamName, rating);
  }
  
  return ratings;
}

// ============================================
// Spread Projection
// ============================================

/**
 * Project spread for a matchup
 * 
 * @param homeRating - Home team's current rating (neutral floor)
 * @param awayRating - Away team's current rating (neutral floor)
 * @param hca - Home court advantage to apply
 * @param isNeutralSite - If true, no HCA is applied
 * @returns Projected spread from home team perspective (negative = home favored)
 */
export function projectSpread(
  homeRating: number,
  awayRating: number,
  hca: number,
  isNeutralSite: boolean = false
): number {
  const hcaToApply = isNeutralSite ? 0 : hca;
  
  // Spread = -(HomeRating - AwayRating + HCA)
  // Negative spread means home team is favored
  // e.g., Home +25, Away +20, HCA +2.5 => Home -7.5
  const rawSpread = -((homeRating - awayRating) + hcaToApply);
  
  return roundToDecimal(rawSpread, SPREAD_DECIMAL_PLACES);
}

/**
 * Get full projection result with all details
 */
export function getProjection(
  homeTeam: string,
  awayTeam: string,
  ratings: Map<string, TeamRating>,
  config: RatingsConfig = DEFAULT_RATINGS_CONFIG,
  isNeutralSite: boolean = false
): ProjectionResult | null {
  const homeTeamData = findTeamByName(homeTeam, 
    new Map([...ratings].map(([k, v]) => [k, v.rating]))
  );
  const awayTeamData = findTeamByName(awayTeam,
    new Map([...ratings].map(([k, v]) => [k, v.rating]))
  );
  
  if (!homeTeamData || !awayTeamData) {
    return null;
  }
  
  const hcaApplied = isNeutralSite ? 0 : config.hca;
  const projectedSpread = projectSpread(
    homeTeamData.rating,
    awayTeamData.rating,
    config.hca,
    isNeutralSite
  );
  
  return {
    homeTeam: homeTeamData.name,
    awayTeam: awayTeamData.name,
    homeRating: homeTeamData.rating,
    awayRating: awayTeamData.rating,
    projectedSpread,
    isNeutralSite,
    hcaApplied,
  };
}

// ============================================
// Rating Adjustment
// ============================================

/**
 * Calculate adjustment based on difference between projected and closing spread
 * 
 * @param projectedSpread - Model's projected spread (home perspective)
 * @param closingSpread - Market closing spread (home perspective)
 * @returns Adjustment amount (half the difference)
 */
export function calculateAdjustment(
  projectedSpread: number,
  closingSpread: number
): number {
  // Difference = Closing - Projected
  // If closing is more favorable to home than projected, home gets positive adjustment
  // Adjustment is split evenly between the two teams
  const difference = closingSpread - projectedSpread;
  const adjustment = difference / 2;
  
  return roundToDecimal(adjustment, RATINGS_DECIMAL_PLACES);
}

/**
 * Apply adjustment to team ratings after a game
 */
export function applyAdjustment(
  ratings: Map<string, TeamRating>,
  homeTeam: string,
  awayTeam: string,
  adjustment: number
): { homeRating: TeamRating; awayRating: TeamRating } | null {
  const homeRating = ratings.get(homeTeam);
  const awayRating = ratings.get(awayTeam);
  
  if (!homeRating || !awayRating) {
    return null;
  }
  
  const now = new Date().toISOString();
  
  // When closing spread is LESS favorable to away team than projected,
  // (i.e., market thinks away team is worse than our model),
  // away team rating should DECREASE and home team rating should INCREASE.
  // 
  // Example: Projected +10 (away favored by 10), Closing +3.5 (away favored by 3.5)
  // Difference = 3.5 - 10 = -6.5, Adjustment = -3.25
  // Away team should go DOWN by 3.25 (market says they're worse)
  // Home team should go UP by 3.25 (market says they're better)
  //
  // So: awayRating += adjustment (negative adjustment = decrease)
  //     homeRating -= adjustment (negative adjustment = increase)
  
  awayRating.rating = roundToDecimal(awayRating.rating + adjustment, RATINGS_DECIMAL_PLACES);
  awayRating.gamesProcessed += 1;
  awayRating.lastUpdated = now;
  
  homeRating.rating = roundToDecimal(homeRating.rating - adjustment, RATINGS_DECIMAL_PLACES);
  homeRating.gamesProcessed += 1;
  homeRating.lastUpdated = now;
  
  return { homeRating, awayRating };
}

// ============================================
// Game Processing
// ============================================

/**
 * Process a single game and return the adjustment record
 */
export function processGame(
  game: {
    id: string;
    date: string;
    homeTeam: string;
    awayTeam: string;
    closingSpread: number;
    closingSource: ClosingLineSource;
    isNeutralSite: boolean;
  },
  ratings: Map<string, TeamRating>,
  config: RatingsConfig = DEFAULT_RATINGS_CONFIG
): GameAdjustment | null {
  // Find teams in ratings
  const homeTeamMatch = findTeamByName(game.homeTeam,
    new Map([...ratings].map(([k, v]) => [k, v.rating]))
  );
  const awayTeamMatch = findTeamByName(game.awayTeam,
    new Map([...ratings].map(([k, v]) => [k, v.rating]))
  );
  
  if (!homeTeamMatch || !awayTeamMatch) {
    console.warn(`Could not find ratings for: ${game.homeTeam} vs ${game.awayTeam}`);
    return null;
  }
  
  const homeRating = ratings.get(homeTeamMatch.name);
  const awayRating = ratings.get(awayTeamMatch.name);
  
  if (!homeRating || !awayRating) {
    return null;
  }
  
  // Calculate projected spread
  const projectedSpread = projectSpread(
    homeRating.rating,
    awayRating.rating,
    config.hca,
    game.isNeutralSite
  );
  
  // Calculate adjustment
  const difference = game.closingSpread - projectedSpread;
  const adjustment = calculateAdjustment(projectedSpread, game.closingSpread);
  
  // Store before values
  const homeRatingBefore = homeRating.rating;
  const awayRatingBefore = awayRating.rating;
  
  // Apply adjustment
  const result = applyAdjustment(ratings, homeTeamMatch.name, awayTeamMatch.name, adjustment);
  
  if (!result) {
    return null;
  }
  
  // Create adjustment record
  const gameAdjustment: GameAdjustment = {
    gameId: game.id,
    date: game.date,
    homeTeam: homeTeamMatch.name,
    awayTeam: awayTeamMatch.name,
    isNeutralSite: game.isNeutralSite,
    homeRatingBefore,
    awayRatingBefore,
    projectedSpread,
    closingSpread: game.closingSpread,
    closingSource: game.closingSource,
    difference: roundToDecimal(difference, RATINGS_DECIMAL_PLACES),
    adjustment,
    homeRatingAfter: result.homeRating.rating,
    awayRatingAfter: result.awayRating.rating,
  };
  
  return gameAdjustment;
}

/**
 * Process multiple games in chronological order
 */
export function processGames(
  games: Array<{
    id: string;
    date: string;
    homeTeam: string;
    awayTeam: string;
    closingSpread: number;
    closingSource: ClosingLineSource;
    isNeutralSite: boolean;
  }>,
  ratings: Map<string, TeamRating>,
  config: RatingsConfig = DEFAULT_RATINGS_CONFIG
): GameAdjustment[] {
  // Sort games by date (chronological order)
  const sortedGames = [...games].sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  
  const adjustments: GameAdjustment[] = [];
  
  for (const game of sortedGames) {
    const adjustment = processGame(game, ratings, config);
    if (adjustment) {
      adjustments.push(adjustment);
    }
  }
  
  return adjustments;
}

// ============================================
// Closing Line Extraction
// ============================================

/**
 * Extract closing spread from Odds API game data
 */
export function extractClosingSpread(
  game: OddsAPIGame,
  source: ClosingLineSource,
  usBookmakerKeys: string[] = ['draftkings', 'fanduel', 'betmgm', 'betrivers', 'williamhill_us']
): ClosingLineResult {
  const result: ClosingLineResult = {
    spread: null,
    source,
    bookmakers: [],
    timestamp: new Date().toISOString(),
  };
  
  if (!game.bookmakers || game.bookmakers.length === 0) {
    return result;
  }
  
  if (source === 'pinnacle') {
    // Find Pinnacle bookmaker
    const pinnacle = game.bookmakers.find(b => b.key === 'pinnacle');
    if (pinnacle) {
      const spreadsMarket = pinnacle.markets.find(m => m.key === 'spreads');
      if (spreadsMarket) {
        const homeOutcome = spreadsMarket.outcomes.find(o => o.name === game.home_team);
        if (homeOutcome?.point !== undefined) {
          result.spread = homeOutcome.point;
          result.bookmakers = ['pinnacle'];
        }
      }
    }
  } else if (source === 'us_average') {
    // Calculate average from US books
    const spreads: number[] = [];
    const usedBooks: string[] = [];
    
    for (const bookKey of usBookmakerKeys) {
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
      result.spread = roundToDecimal(average, SPREAD_DECIMAL_PLACES);
      result.bookmakers = usedBooks;
    }
  }
  
  return result;
}

// ============================================
// Snapshot Creation
// ============================================

/**
 * Create a ratings snapshot
 */
export function createSnapshot(
  ratings: Map<string, TeamRating>,
  adjustments: GameAdjustment[],
  config: RatingsConfig
): RatingsSnapshot {
  // Convert map to sorted array (by rating, descending)
  const ratingsArray = [...ratings.values()].sort((a, b) => b.rating - a.rating);
  
  return {
    asOfDate: new Date().toISOString(),
    season: config.season,
    hca: config.hca,
    closingSource: config.closingSource,
    gamesProcessed: adjustments.length,
    ratings: ratingsArray,
    adjustments,
  };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Round a number to specified decimal places
 */
function roundToDecimal(value: number, decimals: number): number {
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
}

/**
 * Format spread for display (e.g., "-7.5" or "+3")
 */
export function formatSpread(spread: number): string {
  if (spread === 0) return 'PK';
  const sign = spread > 0 ? '+' : '';
  return `${sign}${spread}`;
}

/**
 * Format rating for display
 */
export function formatRating(rating: number): string {
  const sign = rating >= 0 ? '+' : '';
  return `${sign}${rating.toFixed(RATINGS_DECIMAL_PLACES)}`;
}
