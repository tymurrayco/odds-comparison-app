// src/lib/fbs/constants.ts

/**
 * FBS market-driven power ratings — configuration.
 * Seeded from the Brad Powers rating set stored in power_rating_sets
 * (imported via /admin/power-ratings), adjusted by closing lines
 * (same half-the-difference math as the NCAAB and FCS engines).
 */

export const FBS_SEASON = 2026;

// ESPN college football scoreboard; groups=80 = FBS
export const ESPN_FBS_SCOREBOARD_URL =
  'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard';
export const ESPN_FBS_GROUP = '80';

// All college football teams (ESPN ignores the groups filter and returns ~755,
// same trick as the FCS seed and bet-team-logos).
export const ESPN_CFB_TEAMS_URL =
  'https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams?limit=1000&groups=80';

export const ODDS_API_BASE_URL = 'https://api.the-odds-api.com/v4';
export const NCAAF_SPORT_KEY = 'americanfootball_ncaaf';

// Same US consensus books as the NCAAB and FCS engines
export const FBS_CONSENSUS_BOOKS = ['draftkings', 'fanduel', 'betmgm', 'betrivers'];

// Pull the closing line this many minutes before kickoff
export const FBS_CLOSING_TIME_MINUTES = 5;

// Fallback HFA when a team has no per-team Brad Powers HFA
export const FBS_DEFAULT_HFA = 3.0;

// How far back of the last processed game a routine sync rescans (same
// rationale as the FCS twin: a full-season sweep costs one ESPN fetch per
// day and outgrows a phone browser's patience; pass fullScan to override).
export const FBS_SYNC_LOOKBACK_DAYS = 14;

export const FBS_SEASON_DATES: { [season: number]: { start: string; end: string } } = {
  2026: {
    start: '2026-08-22', // week 0
    end: '2027-01-25',   // CFP national championship
  },
};

export const FBS_RATINGS_DECIMAL_PLACES = 2;
export const FBS_SPREAD_DECIMAL_PLACES = 1;

// power_rating_sets source slug the seed reads (see /admin/power-ratings)
export const FBS_SEED_SOURCE = 'brad_powers';
