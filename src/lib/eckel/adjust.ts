// src/lib/eckel/adjust.ts
//
// Opponent adjustment via ridge regression.
//
// One row per team-game; design = [intercept | offense dummies | defense
// dummies | home-field]; target = the game-level metric (Eckel Rate or
// Points per Eckel). Solved with normal equations (X'X + lambda*I) b = X'y —
// ~270 columns for a full FBS season, trivial to solve directly. The
// intercept is not penalized. A team's adjusted offensive value is
// intercept + its offense coefficient (i.e., its expected value against an
// average defense on a neutral field); defensive value analogous.

import { TeamGameRow } from './types';
import { RIDGE_LAMBDA } from './constants';
import { safeDiv } from './metrics';

export interface AdjustedMetric {
  intercept: number;
  hfa: number;
  offense: Map<string, number>; // team -> intercept + off coef
  defense: Map<string, number>; // team -> intercept + def coef
}

/** Solve (A)x = b for symmetric positive-definite A via Gaussian elimination
 *  with partial pivoting. A is modified in place. */
function solve(A: number[][], b: number[]): number[] {
  const n = A.length;
  const x = b.slice();
  for (let col = 0; col < n; col++) {
    // pivot
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
    }
    if (pivot !== col) {
      [A[col], A[pivot]] = [A[pivot], A[col]];
      [x[col], x[pivot]] = [x[pivot], x[col]];
    }
    const diag = A[col][col];
    if (Math.abs(diag) < 1e-12) continue;
    for (let r = col + 1; r < n; r++) {
      const factor = A[r][col] / diag;
      if (factor === 0) continue;
      for (let c = col; c < n; c++) A[r][c] -= factor * A[col][c];
      x[r] -= factor * x[col];
    }
  }
  const out = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let sum = x[r];
    for (let c = r + 1; c < n; c++) sum -= A[r][c] * out[c];
    out[r] = Math.abs(A[r][r]) > 1e-12 ? sum / A[r][r] : 0;
  }
  return out;
}

/**
 * Fit one ridge regression for a game-level metric.
 * valueOf(row) must return the metric for that team-game (e.g. row-level
 * Eckel Rate). Rows with no drives are skipped.
 */
export function ridgeAdjust(
  rows: TeamGameRow[],
  valueOf: (r: TeamGameRow) => number | null,
  lambda: number = RIDGE_LAMBDA
): AdjustedMetric {
  const teams = [...new Set(rows.flatMap((r) => [r.offense, r.defense]))].sort();
  const tIndex = new Map(teams.map((t, i) => [t, i]));
  const T = teams.length;
  const n = 1 + 2 * T + 1; // intercept + off dummies + def dummies + hfa
  const HFA = n - 1;

  // Accumulate X'X and X'y without materializing X (each row has 4 nonzeros).
  const XtX: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const Xty: number[] = new Array(n).fill(0);

  for (const r of rows) {
    const y = valueOf(r);
    if (y == null) continue;
    const cols = [0, 1 + tIndex.get(r.offense)!, 1 + T + tIndex.get(r.defense)!];
    if (!r.neutral && r.homeOffense) cols.push(HFA);
    const vals = cols.map(() => 1);
    // home-field enters as +1 for home offense; away offense simply lacks it,
    // so the hfa coefficient is the home-vs-neutral bump.
    for (let i = 0; i < cols.length; i++) {
      Xty[cols[i]] += vals[i] * y;
      for (let j = 0; j < cols.length; j++) {
        XtX[cols[i]][cols[j]] += vals[i] * vals[j];
      }
    }
  }

  // Ridge penalty on everything except the intercept.
  for (let i = 1; i < n; i++) XtX[i][i] += lambda;

  const beta = solve(XtX, Xty);

  const offense = new Map<string, number>();
  const defense = new Map<string, number>();
  for (const t of teams) {
    offense.set(t, beta[0] + beta[1 + tIndex.get(t)!]);
    defense.set(t, beta[0] + beta[1 + T + tIndex.get(t)!]);
  }
  return { intercept: beta[0], hfa: beta[HFA], offense, defense };
}

/** Row-level Eckel Rate for the regression target. */
export const rowEckelRate = (r: TeamGameRow): number | null =>
  r.drives > 0 ? safeDiv(r.qualityDrives, r.drives) : null;

/** Row-level Points per Eckel. Games where a team had zero quality drives
 *  carry no information about its PPE — skip rather than count as 0. */
export const rowPointsPerEckel = (r: TeamGameRow): number | null =>
  r.qualityDrives > 0 ? safeDiv(r.qualityPoints, r.qualityDrives) : null;
