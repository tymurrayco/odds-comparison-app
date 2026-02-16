// src/lib/lacrosse/types.ts

// ============================================
// Massey Ratings Types
// ============================================

export interface MasseyRating {
  Team: string;
  Conf: string;
  Rec: string;
  Rating: number;
  PwrRating: number;
  OffRating: number;
  DefRating: number;
  HFA: number;
}

// ============================================
// Power Rating Types
// ============================================

export interface TeamRating {
  teamName: string;
  masseyName: string;       // Original Massey name for mapping
  oddsApiName?: string;     // Odds API name if different
  rating: number;           // Current adjusted rating (neutral floor)
  initialRating: number;    // Starting rating from Massey
  gamesProcessed: number;   // Number of games used in adjustment
  lastUpdated: string;      // ISO timestamp
  conference?: string;
}

export interface GameAdjustment {
  gameId: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  isNeutralSite: boolean;
  homeRatingBefore: number;
  awayRatingBefore: number;
  projectedSpread: number;
  closingSpread: number;
  closingSource: ClosingLineSource;
  difference: number;
  adjustment: number;
  homeRatingAfter: number;
  awayRatingAfter: number;
}

export interface RatingsSnapshot {
  asOfDate: string;
  season: number;
  hca: number;
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
  hca: number;
  closingSource: ClosingLineSource;
  closingTimeMinutes: number;
  season: number;
  previousSeason: number;
}

export interface ClosingLineResult {
  spread: number | null;
  source: ClosingLineSource;
  bookmakers: string[];
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
// Sort / UI Types
// ============================================

export type RatingsSortField = 'rating' | 'name' | 'games' | 'change' | 'initial';
export type SortDirection = 'asc' | 'desc';

// ============================================
// Team Name Mapping Types
// ============================================

export interface TeamOverride {
  id?: number;
  sourceName: string;
  masseyName: string;
  espnName?: string;
  oddsApiName?: string;
  source: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}
