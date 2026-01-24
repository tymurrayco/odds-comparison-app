// src/lib/ratings/constants.ts

/**
 * Power Ratings System Constants
 */

import { RatingsConfig, ClosingLineSource } from './types';

// ============================================
// Default Configuration
// ============================================

export const DEFAULT_RATINGS_CONFIG: RatingsConfig = {
  hca: 2.5,                          // Home court advantage in points
  closingSource: 'pinnacle',         // Default to Pinnacle (sharp book)
  closingTimeMinutes: 5,             // Pull closing line 5 min before tip
  season: 2026,                      // 2025-26 season
  previousSeason: 2025,              // 2024-25 season for initial ratings
};

// ============================================
// Bookmaker Configuration
// ============================================

// Pinnacle - considered the sharpest book, closest to "true" market
export const PINNACLE_BOOKMAKER = {
  key: 'pinnacle',
  title: 'Pinnacle',
  region: 'eu',
};

// US Books for average calculation
export const US_AVERAGE_BOOKMAKERS = [
  { key: 'draftkings', title: 'DraftKings' },
  { key: 'fanduel', title: 'FanDuel' },
  { key: 'betmgm', title: 'BetMGM' },
  { key: 'betrivers', title: 'BetRivers' },
  { key: 'williamhill_us', title: 'Caesars' },
];

export const US_AVERAGE_BOOKMAKER_KEYS = US_AVERAGE_BOOKMAKERS.map(b => b.key);

// ============================================
// API Configuration
// ============================================

export const KENPOM_API_BASE_URL = 'https://kenpom.com/api.php';

export const ODDS_API_BASE_URL = 'https://api.the-odds-api.com/v4';

export const NCAAB_SPORT_KEY = 'basketball_ncaab';

// ============================================
// Season Dates
// ============================================

// Approximate season boundaries (used for date range queries)
export const SEASON_DATES: { [season: number]: { start: string; end: string } } = {
  2025: {
    start: '2024-11-04',  // First day of 2024-25 season
    end: '2025-04-07',    // NCAA Championship game
  },
  2026: {
    start: '2025-11-03',  // First day of 2025-26 season (approximate)
    end: '2026-04-06',    // NCAA Championship game (approximate)
  },
};

// Date to pull final ratings from previous season
export const FINAL_RATINGS_DATE: { [season: number]: string } = {
  2025: '2025-04-07',     // Day of 2025 championship game
  2026: '2026-04-06',     // Day of 2026 championship game (approximate)
};

// ============================================
// Neutral Site Detection
// ============================================

// Keywords that indicate a neutral site game
export const NEUTRAL_SITE_KEYWORDS = [
  'neutral',
  'tournament',
  'championship',
  'ncaa',
  'nit',
  'march madness',
  'final four',
  'sweet sixteen',
  'elite eight',
];

// Known neutral site venues/events
export const NEUTRAL_SITE_EVENTS = [
  // Early season tournaments
  'maui invitational',
  'battle 4 atlantis',
  'phil knight invitational',
  'phil knight legacy',
  'empire classic',
  'jimmy v classic',
  'champions classic',
  'gavitt tipoff games',
  'big ten acc challenge',
  // Conference tournaments (held at neutral sites)
  'acc tournament',
  'big ten tournament',
  'big 12 tournament',
  'sec tournament',
  'pac-12 tournament',
  'big east tournament',
  // NCAA Tournament
  'ncaa tournament',
  'first four',
  'first round',
  'second round',
  'sweet 16',
  'elite 8',
  'final four',
  'national championship',
];

// ============================================
// Closing Line Source Options
// ============================================

export const CLOSING_LINE_SOURCES: { value: ClosingLineSource; label: string; description: string }[] = [
  {
    value: 'pinnacle',
    label: 'Pinnacle',
    description: 'Sharp book - considered closest to true market odds',
  },
  {
    value: 'us_average',
    label: 'US Average',
    description: 'Average of DraftKings, FanDuel, BetMGM, BetRivers, Caesars',
  },
];

// ============================================
// Display Configuration
// ============================================

export const RATINGS_DECIMAL_PLACES = 2;

export const SPREAD_DECIMAL_PLACES = 1;
