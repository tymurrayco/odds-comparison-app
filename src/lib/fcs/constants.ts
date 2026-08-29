// src/lib/fcs/constants.ts

/**
 * FCS market-driven power ratings — configuration.
 * Seeded from Massey FCS Pwr ratings, adjusted by closing lines
 * (same half-the-difference math as the NCAAB ratings engine).
 */

export const FCS_SEASON = 2026;

// ESPN college football scoreboard; groups=81 = FCS
export const ESPN_FCS_SCOREBOARD_URL =
  'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard';
export const ESPN_FCS_GROUP = '81';

// All college football teams (ESPN ignores the groups filter and returns ~755,
// which is exactly why FCS teams resolve — same trick as bet-team-logos).
export const ESPN_CFB_TEAMS_URL =
  'https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams?limit=1000&groups=80';

export const ODDS_API_BASE_URL = 'https://api.the-odds-api.com/v4';
export const NCAAF_SPORT_KEY = 'americanfootball_ncaaf';

// Same US consensus books as the NCAAB engine
export const FCS_CONSENSUS_BOOKS = ['draftkings', 'fanduel', 'betmgm', 'betrivers'];

// Pull the closing line this many minutes before kickoff
export const FCS_CLOSING_TIME_MINUTES = 5;

// Fallback HFA when a team has no per-team Massey HFA
export const FCS_DEFAULT_HFA = 2.5;

// How far back of the last processed game a routine sync rescans. The scan
// costs one ESPN fetch per day, so sweeping the whole season grew the request
// longer every week until phone browsers dropped it mid-run. Two weeks covers
// anything that completes late (suspended, rescheduled inside the window);
// pass fullScan to /api/fcs/calculate to sweep from the opener anyway.
export const FCS_SYNC_LOOKBACK_DAYS = 14;

export const FCS_SEASON_DATES: { [season: number]: { start: string; end: string } } = {
  2026: {
    start: '2026-08-22', // week 0
    end: '2027-01-15',   // FCS championship (Frisco)
  },
};

export const FCS_RATINGS_DECIMAL_PLACES = 2;
export const FCS_SPREAD_DECIMAL_PLACES = 1;

export const MASSEY_FCS_RATINGS_URL = 'https://masseyratings.com/cf/fcs/ratings';
