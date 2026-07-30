// src/lib/eckel/constants.ts

/** A quality ("Eckel") drive either reaches a first-and-10 inside the
 *  opponent's 40, or scores a TD from anywhere (big-play TD). With
 *  drive-level data we approximate "reached the opponent's 40" as
 *  end_yards_to_goal <= QUALITY_YARDS_TO_GOAL. */
export const QUALITY_YARDS_TO_GOAL = 40;

/** Garbage time: exclude drives whose start-of-drive score margin exceeds
 *  the threshold for the quarter the drive started in. */
export const GARBAGE_MARGIN_BY_QUARTER: Record<number, number> = {
  1: 43,
  2: 38,
  3: 28,
  4: 22,
};

/** Normalized drive points for Points-per-Eckel: TD drives count 7,
 *  FG drives 3, everything else 0. */
export const TD_POINTS = 7;
export const FG_POINTS = 3;

/** Ridge regression regularization strength for opponent adjustment.
 *  Standard for team-dummy designs at this sample size (~1,600 rows,
 *  ~270 columns) — shrinks small-sample teams toward average. */
export const RIDGE_LAMBDA = 50;

/** Drives per game used to scale per-drive quantities into a per-game
 *  power rating ("vs an average FBS team on a neutral field"). */
export const DRIVES_PER_GAME = 11;

/** Drive results that mean the DEFENSE scored the touchdown — these must
 *  never count as offensive quality/points even though the drive "ended in
 *  a TD". Matched as substrings of CFBD's drive_result. */
export const DEFENSIVE_TD_RESULTS = [
  'INT TD',
  'INT RETURN TOUCH',
  'FUMBLE TD',
  'FUMBLE RETURN TD',
  'PUNT TD',
  'PUNT RETURN TD',
  'KICKOFF TD',
  'MISSED FG TD',
  'DOWNS TD',
  'TURNOVER ON DOWNS TD',
];
