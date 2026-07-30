// src/lib/eckel/types.ts
//
// Eckel ratings — reverse-engineering Parker Fleming's quality-drive metrics
// from CollegeFootballData.com drive data, plus an opponent-adjusted power
// rating layered on top. See constants.ts for the definitions.

/** Normalized drive record (CFBD serves snake_case or camelCase depending on
 *  API generation — fetch.ts normalizes both into this shape). */
export interface EckelDrive {
  gameId: number;
  offense: string;
  defense: string;
  /** Quarter the drive started in (1-4; OT >= 5) */
  startPeriod: number;
  /** Yards to goal when the drive ended */
  endYardsToGoal: number;
  /** Offense/defense score when the drive STARTED (for garbage-time) */
  startOffenseScore: number;
  startDefenseScore: number;
  /** Offense/defense score when the drive ENDED (for drive points) */
  endOffenseScore: number;
  endDefenseScore: number;
  /** CFBD drive_result string, e.g. "TD", "FG", "PUNT", "MISSED FG", "INT TD" */
  driveResult: string;
  isHomeOffense: boolean;
}

export interface EckelGame {
  id: number;
  season: number;
  week: number;
  homeTeam: string;
  awayTeam: string;
  homePoints: number | null;
  awayPoints: number | null;
  neutralSite: boolean;
  completed: boolean;
}

/** One row per team per game — the unit the ridge regression consumes. */
export interface TeamGameRow {
  gameId: number;
  week: number;
  offense: string;
  defense: string;
  homeOffense: boolean;
  neutral: boolean;
  drives: number;          // non-garbage drives
  qualityDrives: number;
  qualityPoints: number;   // normalized: TD drives 7, FG drives 3, else 0
}

export interface TeamSeasonMetrics {
  team: string;
  games: number;
  // Raw (unadjusted) season-to-date
  eckelRateOff: number;
  eckelRateDef: number;
  pointsPerEckelOff: number;
  pointsPerEckelDef: number;
  eckelRatio: number;          // team quality drives / (team + opp quality drives), per game averaged
  expectedMarginPerGame: number;
  // Opponent-adjusted
  adjEckelRateOff: number;
  adjEckelRateDef: number;
  adjPointsPerEckelOff: number;
  adjPointsPerEckelDef: number;
  // Records
  wins: number;
  losses: number;
  xWins: number;
  luckDelta: number;           // wins - xWins
  powerRating: number;         // expected margin vs avg FBS team, neutral field
}

export interface EckelSnapshot {
  season: number;
  week: number | null;         // null = full season-to-date at compute time
  computedAt: string;
  teams: TeamSeasonMetrics[];
  validation: string[];        // sanity-check warnings
  meta: {
    games: number;
    drives: number;
    garbageDrivesExcluded: number;
    hfaPoints: number;         // fitted home-field coefficient, in expected points
    logistic: { intercept: number; slope: number };
  };
}
