// src/lib/ratings/types.ts

/**
 * Power Ratings System Types
 * 
 * This system maintains market-adjusted power ratings for NCAAB teams.
 * Ratings start from KenPom's final AdjEM from the previous season and
 * are adjusted based on the difference between projected spreads and
 * actual closing lines.
 */

// ============================================
// KenPom API Types
// ============================================

export interface KenPomRating {
  TeamName: string;
  TeamID: number;
  Season: number;
  AdjEM: number;           // Adjusted Efficiency Margin - the core rating
  RankAdjEM: number;
  AdjOE: number;           // Adjusted Offensive Efficiency
  RankAdjOE: number;
  AdjDE: number;           // Adjusted Defensive Efficiency
  RankAdjDE: number;
  AdjTempo: number;
  RankAdjTempo: number;
  Wins?: number;
  Losses?: number;
  ConfShort?: string;
  Coach?: string;
}

export interface KenPomTeam {
  TeamID: number;
  TeamName: string;
  ConfShort: string;
  Season: number;
  Coach?: string;
  Arena?: string;
  ArenaCity?: string;
  ArenaState?: string;
}

export interface KenPomArchiveRating extends KenPomRating {
  ArchiveDate: string;
  Preseason: string;       // "true" or "false"
  AdjEMFinal?: number;
  RankAdjEMFinal?: number;
}

// ============================================
// Odds API Types
// ============================================

export interface OddsAPIGame {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;   // ISO 8601 format
  home_team: string;
  away_team: string;
  bookmakers: OddsAPIBookmaker[];
}

export interface OddsAPIBookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: OddsAPIMarket[];
}

export interface OddsAPIMarket {
  key: string;             // 'spreads', 'h2h', 'totals'
  last_update: string;
  outcomes: OddsAPIOutcome[];
}

export interface OddsAPIOutcome {
  name: string;            // Team name or 'Over'/'Under'
  price: number;           // American odds
  point?: number;          // Spread or total value
}

export interface HistoricalOddsResponse {
  timestamp: string;
  previous_timestamp: string;
  next_timestamp: string;
  data: OddsAPIGame[];
}

// ============================================
// Power Rating Types
// ============================================

export interface TeamRating {
  teamName: string;
  kenpomName: string;      // Original KenPom name for mapping
  oddsApiName?: string;    // Odds API name if different
  rating: number;          // Current adjusted rating (neutral floor)
  initialRating: number;   // Starting rating from KenPom
  gamesProcessed: number;  // Number of games used in adjustment
  lastUpdated: string;     // ISO timestamp
  conference?: string;
}

export interface GameAdjustment {
  gameId: string;
  date: string;            // ISO date
  homeTeam: string;
  awayTeam: string;
  isNeutralSite: boolean;
  homeRatingBefore: number;
  awayRatingBefore: number;
  projectedSpread: number; // Home team perspective (negative = home favored)
  closingSpread: number;   // From market
  closingSource: ClosingLineSource;
  difference: number;      // closing - projected
  adjustment: number;      // difference / 2
  homeRatingAfter: number;
  awayRatingAfter: number;
}

export interface RatingsSnapshot {
  asOfDate: string;
  season: number;          // e.g., 2026 for 2025-26 season
  hca: number;             // Home court advantage used
  closingSource: ClosingLineSource;
  gamesProcessed: number;
  ratings: TeamRating[];
  adjustments: GameAdjustment[];
}

// ============================================
// Configuration Types
// ============================================

export type ClosingLineSource = 'pinnacle' | 'us_average';

export interface RatingsConfig {
  hca: number;                      // Home court advantage (default 2.5)
  closingSource: ClosingLineSource; // Which closing line to use
  closingTimeMinutes: number;       // Minutes before game to pull closing line
  season: number;                   // Current season (ending year, e.g., 2026)
  previousSeason: number;           // Previous season for initial ratings
}

export interface ClosingLineResult {
  spread: number | null;   // Home team spread (negative = home favored)
  source: ClosingLineSource;
  bookmakers: string[];    // Which books were used
  timestamp: string;
}

// ============================================
// API Response Types
// ============================================

export interface RatingsAPIResponse {
  success: boolean;
  data?: RatingsSnapshot;
  error?: string;
}

export interface ProjectionResult {
  homeTeam: string;
  awayTeam: string;
  homeRating: number;
  awayRating: number;
  projectedSpread: number;
  isNeutralSite: boolean;
  hcaApplied: number;
}

// ============================================
// Team Name Mapping Types
// ============================================

export interface TeamNameMapping {
  kenpom: string;
  oddsApi: string;
  espn?: string;
  shortName?: string;
}
