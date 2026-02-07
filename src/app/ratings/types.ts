// src/app/ratings/types.ts
// Shared types for ratings page components

import { RatingsSnapshot, GameAdjustment, ClosingLineSource } from '@/lib/ratings/types';

// Re-export for convenience
export type { RatingsSnapshot, GameAdjustment, ClosingLineSource };

export interface MatchingLog {
  gameId: string;
  gameDate: string;
  espnHome: string;
  espnAway: string;
  matchedHome: string | null;
  matchedAway: string | null;
  homeFound: boolean;
  awayFound: boolean;
  status: 'success' | 'home_not_found' | 'away_not_found' | 'both_not_found' | 'no_odds' | 'no_spread';
  skipReason: string | null;
  closingSpread: number | null;
}

export interface MatchingStats {
  total: number;
  success: number;
  homeNotFound: number;
  awayNotFound: number;
  bothNotFound: number;
  noOdds: number;
  noSpread: number;
}

export interface TeamOverride {
  id?: number;
  sourceName: string;
  kenpomName: string;
  espnName?: string;
  oddsApiName?: string;
  torvikName?: string;
  source: string;
  notes?: string;
}

export interface CalculateResponse {
  success: boolean;
  error?: string;
  lastCalculated?: string;
  syncRange?: {
    firstGameDate: string | null;
    lastGameDate: string | null;
  };
  config?: {
    hca: number;
    closingSource: ClosingLineSource;
    season: number;
  };
  summary?: {
    teamsCount: number;
    gamesProcessed: number;
    newGamesProcessed?: number;
    gamesSkipped?: number;
    topTeams?: Array<{ team: string; rating: number }>;
  };
  data?: RatingsSnapshot;
  matchingLogs?: MatchingLog[];
  matchingStats?: MatchingStats;
}

// Barttorvik interfaces
export interface BTGame {
  date: string;
  time: string;
  away_team: string;
  home_team: string;
  away_rank?: number;
  home_rank?: number;
  spread?: number;
  total?: number;
  away_score?: number;
  home_score?: number;
  status: 'scheduled' | 'in_progress' | 'final';
  venue?: string;
  neutral?: boolean;
  predicted_spread?: number;
  predicted_total?: number;
  away_win_prob?: number;
  home_win_prob?: number;
}

export interface BTRating {
  rank: number;
  team: string;
  conf: string;
  record: string;
  adj_o: number;
  adj_d: number;
  adj_t: number;
  barthag: number;
}

// Schedule interfaces
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

export interface CombinedScheduleGame {
  // BT data (always present)
  id: string;
  gameDate: string; // YYYY-MM-DD format
  gameTime: string;
  homeTeam: string; // BT team name
  awayTeam: string; // BT team name
  btSpread: number | null;
  btTotal: number | null;
  homeWinProb: number | null;
  awayWinProb: number | null;
  // Odds API data (may be null if no odds yet)
  oddsGameId: string | null;
  spread: number | null;
  openingSpread: number | null;
  total: number | null;
  spreadBookmaker: string | null;
  hasStarted: boolean;
  isFrozen: boolean;
  // Computed
  isToday: boolean;
  isTomorrow: boolean;
  isDay2: boolean;
  isDay3: boolean;
  dateLabel: string; // "Today", "Tomorrow", "Jan 31", etc.
}

// History interface
export interface HistoryGame {
  id: string;
  gameDate: string;
  homeTeam: string;
  awayTeam: string;
  projectedSpread: number | null;
  openingSpread: number | null;
  closingSpread: number | null;
  closingSource: string | null;
  btSpread: number | null;
  difference: number | null;
}

// Tab type
export type TabType = 'ratings' | 'hypotheticals' | 'schedule' | 'history' | 'matching' | 'overrides' | 'barttorvik';

// Sort types
export type RatingsSortField = 'rating' | 'name' | 'games' | 'change' | 'initial';
export type HistorySortField = 'date' | 'diff' | 'vOpen' | 'awayMovement' | 'homeMovement';
export type ScheduleSortField = 'time' | 'delta' | 'vOpen' | 'awayMovement' | 'homeMovement';
export type SortDirection = 'asc' | 'desc';

// Filter types
export type ScheduleFilter = 'all' | 'today' | 'tomorrow' | 'day2' | 'day3';
export type LogFilter = 'all' | 'success' | 'failed';
