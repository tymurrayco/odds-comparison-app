// src/lib/lacrosse/constants.ts

import { RatingsConfig, ClosingLineSource } from './types';

// ============================================
// Default Configuration
// ============================================

export const DEFAULT_LACROSSE_CONFIG: RatingsConfig = {
  hca: 1.0,                          // Home field advantage in goals (~1.0-1.5 for lacrosse)
  closingSource: 'pinnacle',         // Default to Pinnacle (sharp book)
  closingTimeMinutes: 5,
  season: 2026,                      // 2025-26 season
  previousSeason: 2025,
};

// ============================================
// Sport Key
// ============================================

export const LACROSSE_SPORT_KEY = 'lacrosse_ncaa';

// ============================================
// Bookmaker Configuration
// ============================================

export const PINNACLE_BOOKMAKER = {
  key: 'pinnacle',
  title: 'Pinnacle',
  region: 'eu',
};

export const US_AVERAGE_BOOKMAKERS = [
  { key: 'draftkings', title: 'DraftKings' },
  { key: 'fanduel', title: 'FanDuel' },
  { key: 'betmgm', title: 'BetMGM' },
  { key: 'betrivers', title: 'BetRivers' },
];

export const US_AVERAGE_BOOKMAKER_KEYS = US_AVERAGE_BOOKMAKERS.map(b => b.key);

// ============================================
// Season Dates
// ============================================

export const LACROSSE_SEASON_DATES: { [season: number]: { start: string; end: string } } = {
  2026: {
    start: '2026-02-07',  // Approximate start of 2026 lacrosse season
    end: '2026-05-25',    // NCAA Championship weekend
  },
};

// ============================================
// Neutral Site Detection
// ============================================

export const NEUTRAL_SITE_KEYWORDS = [
  'neutral',
  'tournament',
  'championship',
  'ncaa',
];

export const NEUTRAL_SITE_EVENTS = [
  'ncaa tournament',
  'conference tournament',
  'first round',
  'quarterfinals',
  'semifinals',
  'championship',
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
    description: 'Average of DraftKings, FanDuel, BetMGM, BetRivers',
  },
];

// ============================================
// Display Configuration
// ============================================

export const RATINGS_DECIMAL_PLACES = 2;

export const SPREAD_DECIMAL_PLACES = 1;
