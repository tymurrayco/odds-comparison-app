// src/lib/crossDivision.ts

/**
 * FBS-vs-FCS cross-division projections.
 *
 * The two rating systems live on different scales (Brad Powers ~44-94 for
 * FBS, Massey Pwr ~15-50 for FCS) with ZERO overlap teams to bridge them
 * (NDSU / Sacramento State moved up to FBS in 2026, so Powers rates them and
 * Massey's FCS list doesn't). The bridge is the market instead: every lined
 * FBS-vs-FCS game implies a scale offset
 *
 *   projected = -((fbsRating - (fcsRating + X)) + hfa) = marketSpread
 *   =>  X = marketSpread + fbsRating - fcsRating + hfa   (FBS home)
 *   =>  X = -marketSpread + fbsRating - fcsRating - hfa  (FCS home)
 *
 * and the MEDIAN implied X across the window's lined cross games is the
 * consensus scale conversion. Individual games then project with that single
 * X, so the edge column shows how far each line sits from the consensus gap
 * (a game priced with a much bigger/smaller FBS-FCS gap than its peers).
 */

/** Fallback when fewer than MIN_CALIBRATION_GAMES cross games carry a line.
 *  Anchored on NDSU: Powers 60 vs his old Massey-scale peers ~46-50 puts the
 *  scale gap at roughly a touchdown and a half. Market calibration replaces
 *  this whenever it can. */
export const FCS_TO_FBS_OFFSET_FALLBACK = 9.0;
export const MIN_CALIBRATION_GAMES = 3;

/** Solve the scale offset X implied by one lined cross game.
 *  marketSpread is home-perspective (negative = home favored). */
export function impliedScaleOffset(
  marketSpread: number,
  fbsRating: number,
  fcsRating: number,
  hfaApplied: number,
  fbsIsHome: boolean
): number {
  return fbsIsHome
    ? marketSpread + fbsRating - fcsRating + hfaApplied
    : -marketSpread + fbsRating - fcsRating - hfaApplied;
}

export interface OffsetCalibration {
  offset: number;
  source: 'market' | 'fallback';
  sampleCount: number;
}

/** Median of the implied offsets, or the fallback when the sample is thin. */
export function calibrateScaleOffset(implied: number[]): OffsetCalibration {
  if (implied.length < MIN_CALIBRATION_GAMES) {
    return {
      offset: FCS_TO_FBS_OFFSET_FALLBACK,
      source: 'fallback',
      sampleCount: implied.length,
    };
  }
  const sorted = [...implied].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return {
    offset: Math.round(median * 10) / 10,
    source: 'market',
    sampleCount: implied.length,
  };
}
