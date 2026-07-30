// src/lib/eckel/classify.ts
//
// Pure per-drive classification: quality (Eckel) drives, garbage time,
// and normalized drive points. Unit-tested in scripts/eckel.test.ts.

import { EckelDrive } from './types';
import {
  QUALITY_YARDS_TO_GOAL,
  GARBAGE_MARGIN_BY_QUARTER,
  TD_POINTS,
  FG_POINTS,
  DEFENSIVE_TD_RESULTS,
} from './constants';

/** Did the DEFENSE score the TD on this drive (pick-six etc.)? */
export function isDefensiveScore(drive: EckelDrive): boolean {
  const result = (drive.driveResult || '').toUpperCase();
  if (DEFENSIVE_TD_RESULTS.some((r) => result.includes(r))) return true;
  // Belt and suspenders: the defense's score went up during the drive.
  return drive.endDefenseScore - drive.startDefenseScore >= 6;
}

/** Offensive TD on this drive? Prefer the score delta (robust to CFBD's
 *  drive_result string zoo); the result string is a fallback. */
export function isOffensiveTD(drive: EckelDrive): boolean {
  if (isDefensiveScore(drive)) return false;
  const delta = drive.endOffenseScore - drive.startOffenseScore;
  if (delta >= 6) return true;
  const result = (drive.driveResult || '').toUpperCase();
  return result === 'TD' || result === 'RUSHING TD' || result === 'PASSING TD';
}

/** Made field goal on this drive? "MISSED FG" must not count. */
export function isFieldGoal(drive: EckelDrive): boolean {
  if (isOffensiveTD(drive)) return false;
  const delta = drive.endOffenseScore - drive.startOffenseScore;
  if (delta === 3) return true;
  const result = (drive.driveResult || '').toUpperCase();
  return (result === 'FG' || result === 'FG GOOD') && !result.includes('MISSED');
}

/** Quality (Eckel) drive: reached the opponent's 40 (approximated as
 *  end_yards_to_goal <= 40) OR ended in an offensive TD from anywhere. */
export function isQualityDrive(drive: EckelDrive): boolean {
  if (isDefensiveScore(drive)) return false;
  if (isOffensiveTD(drive)) return true;
  return drive.endYardsToGoal <= QUALITY_YARDS_TO_GOAL;
}

/** Garbage time: start-of-drive margin beyond the quarter threshold.
 *  Overtime (period >= 5) is never garbage time. */
export function isGarbageTime(drive: EckelDrive): boolean {
  const threshold = GARBAGE_MARGIN_BY_QUARTER[drive.startPeriod];
  if (threshold == null) return false;
  const margin = Math.abs(drive.startOffenseScore - drive.startDefenseScore);
  return margin > threshold;
}

/** Normalized points for Points-per-Eckel: TD 7, FG 3, else 0. */
export function drivePoints(drive: EckelDrive): number {
  if (isOffensiveTD(drive)) return TD_POINTS;
  if (isFieldGoal(drive)) return FG_POINTS;
  return 0;
}
