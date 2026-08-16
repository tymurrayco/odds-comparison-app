// src/lib/props/markets.ts
// NFL prop market definitions: Odds API keys ↔ game-log stat columns,
// default distribution shape, and reference-derivation rules.

export interface PlayerGameLog {
  player_id: string;
  player_name: string;
  position: string;
  team: string;
  opponent: string | null;
  season: number;
  week: number;
  season_type: 'REG' | 'POST';
  completions: number | null;
  attempts: number | null;
  passing_yards: number | null;
  passing_tds: number | null;
  interceptions: number | null;
  carries: number | null;
  rushing_yards: number | null;
  rushing_tds: number | null;
  receptions: number | null;
  targets: number | null;
  receiving_yards: number | null;
  receiving_tds: number | null;
}

export type StatColumn =
  | 'completions' | 'attempts' | 'passing_yards'
  | 'carries' | 'rushing_yards'
  | 'receptions' | 'targets' | 'receiving_yards';

export type Distribution = 'normal' | 'lognormal';

// Books the app tracks — same set as BOOKMAKERS in src/lib/api.ts, minus
// Kalshi/BetOnline which don't quote player props. Keys are Odds API `title`
// strings; anything else the API returns (Fanatics, ESPN BET, Bovada, …) is
// dropped so consensus lines and best-price EV only use books Tyler can bet.
export const PROP_BOOKS = new Set(['DraftKings', 'FanDuel', 'BetMGM', 'BetRivers', 'Caesars']);

export interface PropMarketDef {
  key: string;               // internal key
  label: string;
  oddsApiKey: string;        // Odds API market key
  oddsApiAltKey: string | null; // alternate-lines market key (null = none)
  stat: StatColumn;          // game-log column the market settles on
  opportunityStat: StatColumn; // volume column (used for game filters / decomposition)
  positions: string[];       // positions eligible for reference derivation
  defaultDist: Distribution; // yardage = lognormal (right skew), counting = normal
  qualifyMin: number;        // per-game mean of opportunityStat to count a player-season
  tierBounds: number[];      // tier edges on per-game mean of `stat` (ascending)
  ladderStep: number;        // synthetic ladder step when no alt lines available
}

export const PROP_MARKETS: PropMarketDef[] = [
  {
    key: 'rush_yds', label: 'Rushing Yards',
    oddsApiKey: 'player_rush_yds', oddsApiAltKey: 'player_rush_yds_alternate',
    stat: 'rushing_yards', opportunityStat: 'carries',
    positions: ['RB', 'QB'], defaultDist: 'lognormal',
    qualifyMin: 8, tierBounds: [60, 80], ladderStep: 10,
  },
  {
    key: 'rush_attempts', label: 'Rush Attempts',
    oddsApiKey: 'player_rush_attempts', oddsApiAltKey: null,
    stat: 'carries', opportunityStat: 'carries',
    positions: ['RB', 'QB'], defaultDist: 'normal',
    qualifyMin: 8, tierBounds: [12, 18], ladderStep: 2.5,
  },
  {
    key: 'rec_yds', label: 'Receiving Yards',
    oddsApiKey: 'player_reception_yds', oddsApiAltKey: 'player_reception_yds_alternate',
    stat: 'receiving_yards', opportunityStat: 'targets',
    positions: ['WR', 'TE', 'RB'], defaultDist: 'lognormal',
    qualifyMin: 4, tierBounds: [45, 70], ladderStep: 10,
  },
  {
    key: 'receptions', label: 'Receptions',
    oddsApiKey: 'player_receptions', oddsApiAltKey: 'player_receptions_alternate',
    stat: 'receptions', opportunityStat: 'targets',
    positions: ['WR', 'TE', 'RB'], defaultDist: 'normal',
    qualifyMin: 4, tierBounds: [3.5, 5.5], ladderStep: 1,
  },
  {
    key: 'pass_yds', label: 'Passing Yards',
    oddsApiKey: 'player_pass_yds', oddsApiAltKey: 'player_pass_yds_alternate',
    stat: 'passing_yards', opportunityStat: 'attempts',
    positions: ['QB'], defaultDist: 'normal', // high volume smooths the curve
    qualifyMin: 20, tierBounds: [210, 250], ladderStep: 20,
  },
  {
    key: 'pass_attempts', label: 'Pass Attempts',
    oddsApiKey: 'player_pass_attempts', oddsApiAltKey: null,
    stat: 'attempts', opportunityStat: 'attempts',
    positions: ['QB'], defaultDist: 'normal',
    qualifyMin: 20, tierBounds: [30, 36], ladderStep: 2.5,
  },
  {
    key: 'pass_completions', label: 'Completions',
    oddsApiKey: 'player_pass_completions', oddsApiAltKey: null,
    stat: 'completions', opportunityStat: 'attempts',
    positions: ['QB'], defaultDist: 'normal',
    qualifyMin: 20, tierBounds: [19, 24], ladderStep: 2,
  },
];

export const marketByKey = (key: string): PropMarketDef | undefined =>
  PROP_MARKETS.find((m) => m.key === key);

export const marketByOddsApiKey = (oddsKey: string): PropMarketDef | undefined =>
  PROP_MARKETS.find((m) => m.oddsApiKey === oddsKey || m.oddsApiAltKey === oddsKey);
