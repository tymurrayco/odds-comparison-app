// src/lib/nfl/constants.ts

/**
 * NFL Ledger ratings — configuration.
 *
 * Seeded from a MARKET-IMPLIED fit: every team's rating is solved by least
 * squares from the full-season spreads the books post before Week 1
 * (DraftKings carries all 17 weeks; FanDuel/BetMGM/BetRivers the next two),
 * with unlined teams filled from Jeff Sagarin's starting ratings rescaled
 * onto the fit. The stored set lives in power_rating_sets (sport 'nfl',
 * source NFL_SEED_SOURCE). Ratings then move only by closing lines — same
 * half-the-difference math as the FBS/FCS engines.
 */

export const NFL_SEASON = 2026;

export const ESPN_NFL_SCOREBOARD_URL =
  'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
export const ESPN_NFL_TEAMS_URL =
  'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams?limit=40';

export const ODDS_API_BASE_URL = 'https://api.the-odds-api.com/v4';
export const NFL_SPORT_KEY = 'americanfootball_nfl';

// Same US consensus books as the NCAAB/FBS/FCS engines
export const NFL_CONSENSUS_BOOKS = ['draftkings', 'fanduel', 'betmgm', 'betrivers'];

// Pull the closing line this many minutes before kickoff
export const NFL_CLOSING_TIME_MINUTES = 5;

// Uniform market home-field edge. The 2026 season-line fit solved 1.65 and the
// market convention is 1.5 (Sagarin's data-fit is 2.03); per-team hfa on the
// ratings row is null unless someone sets one by hand.
export const NFL_DEFAULT_HFA = 1.5;

// HFA nudge (Tyler, 2026-09-11): after every non-neutral priced game the
// config HFA moves by this fraction of the game's miss (closing − projected,
// home perspective) in the direction that would have shrunk it. Team errors
// average out across home/away assignments; a wrong HFA doesn't. At 2% the
// half-life is ~35 games (two NFL weeks) and the noise floor ~0.15 points.
// Set to 0 to freeze HFA at the config value.
export const NFL_HFA_NUDGE_RATE = 0.02;

// Routine sync rescans this far back of the last processed game (see FBS twin)
export const NFL_SYNC_LOOKBACK_DAYS = 14;

export const NFL_SEASON_DATES: { [season: number]: { start: string; end: string } } = {
  2026: {
    start: '2026-09-09', // Wed opener (Patriots at Seahawks)
    end: '2027-02-15',   // Super Bowl LXI (Feb 14, 2027) + a day of UTC slack
  },
};

export const NFL_RATINGS_DECIMAL_PLACES = 2;
export const NFL_SPREAD_DECIMAL_PLACES = 1;

// power_rating_sets source slug the seed writes and reads
export const NFL_SEED_SOURCE = 'market_fit';
export const NFL_SEED_SOURCE_LABEL = 'Market fit (season lines + Sagarin fill)';

// Sagarin's plain-text NFL page (http: the https cert is expired; Node fetch
// rejects it). Only used to place teams the books have not lined yet.
export const SAGARIN_NFL_URL = 'http://sagarin.com/sports/nflsend.htm';

// ESPN abbreviation -> division (the teams endpoint doesn't carry groups)
export const NFL_DIVISIONS: Record<string, string> = {
  BUF: 'AFC East', MIA: 'AFC East', NE: 'AFC East', NYJ: 'AFC East',
  BAL: 'AFC North', CIN: 'AFC North', CLE: 'AFC North', PIT: 'AFC North',
  HOU: 'AFC South', IND: 'AFC South', JAX: 'AFC South', TEN: 'AFC South',
  DEN: 'AFC West', KC: 'AFC West', LV: 'AFC West', LAC: 'AFC West',
  DAL: 'NFC East', NYG: 'NFC East', PHI: 'NFC East', WSH: 'NFC East',
  CHI: 'NFC North', DET: 'NFC North', GB: 'NFC North', MIN: 'NFC North',
  ATL: 'NFC South', CAR: 'NFC South', NO: 'NFC South', TB: 'NFC South',
  ARI: 'NFC West', LAR: 'NFC West', SF: 'NFC West', SEA: 'NFC West',
};

export const nflLogoUrl = (abbr: string | null | undefined): string | null =>
  abbr ? `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png` : null;
