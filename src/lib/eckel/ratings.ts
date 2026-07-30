// src/lib/eckel/ratings.ts
//
// Expected margins, logistic xRecord, luck delta, and the power rating.

import { EckelGame, TeamGameRow } from './types';
import { RawTeamAgg, safeDiv } from './metrics';
import { AdjustedMetric } from './adjust';
import { DRIVES_PER_GAME } from './constants';

/** Per-game expected points for one side: drives x EckelRate x PointsPerEckel,
 *  using each side's RAW season rates (Fleming's expected-margin construction). */
function expectedPointsFor(
  agg: RawTeamAgg | undefined,
  drives: number
): number {
  if (!agg) return 0;
  const rate = safeDiv(agg.offQuality, agg.offDrives);
  const ppe = safeDiv(agg.offQualityPoints, agg.offQuality);
  return drives * rate * ppe;
}

export interface GameExpectation {
  gameId: number;
  team: string;
  opponent: string;
  expectedMargin: number;
  won: boolean | null; // null when the game has no final score
}

/** Expected margin per completed game, from each side's season rates and the
 *  actual drive counts in that game. */
export function buildGameExpectations(
  rows: TeamGameRow[],
  aggs: Map<string, RawTeamAgg>,
  games: Map<number, EckelGame>
): GameExpectation[] {
  const byGame = new Map<number, TeamGameRow[]>();
  for (const r of rows) {
    const list = byGame.get(r.gameId) || [];
    list.push(r);
    byGame.set(r.gameId, list);
  }
  const out: GameExpectation[] = [];
  for (const [gameId, pair] of byGame) {
    if (pair.length !== 2) continue;
    const game = games.get(gameId);
    const [a, b] = pair;
    const expA = expectedPointsFor(aggs.get(a.offense), a.drives);
    const expB = expectedPointsFor(aggs.get(b.offense), b.drives);
    for (const [me, them, expMe, expThem] of [
      [a.offense, b.offense, expA, expB] as const,
      [b.offense, a.offense, expB, expA] as const,
    ]) {
      let won: boolean | null = null;
      if (game && game.completed && game.homePoints != null && game.awayPoints != null) {
        const myPoints = game.homeTeam === me ? game.homePoints : game.awayPoints;
        const theirPoints = game.homeTeam === me ? game.awayPoints : game.homePoints;
        won = myPoints > theirPoints;
      }
      out.push({ gameId, team: me, opponent: them, expectedMargin: expMe - expThem, won });
    }
  }
  return out;
}

/** 1-feature logistic regression (win ~ expected margin) fit by
 *  Newton-Raphson. Returns intercept + slope. */
export function fitLogistic(points: Array<{ x: number; y: number }>): {
  intercept: number;
  slope: number;
} {
  let b0 = 0;
  let b1 = 0.08; // sensible starting slope for point margins
  for (let iter = 0; iter < 25; iter++) {
    let g0 = 0, g1 = 0, h00 = 0, h01 = 0, h11 = 0;
    for (const { x, y } of points) {
      const p = 1 / (1 + Math.exp(-(b0 + b1 * x)));
      const w = p * (1 - p);
      g0 += y - p;
      g1 += (y - p) * x;
      h00 += w;
      h01 += w * x;
      h11 += w * x * x;
    }
    const det = h00 * h11 - h01 * h01;
    if (Math.abs(det) < 1e-9) break;
    const d0 = (h11 * g0 - h01 * g1) / det;
    const d1 = (h00 * g1 - h01 * g0) / det;
    b0 += d0;
    b1 += d1;
    if (Math.abs(d0) < 1e-8 && Math.abs(d1) < 1e-8) break;
  }
  return { intercept: b0, slope: b1 };
}

export const winProb = (margin: number, fit: { intercept: number; slope: number }): number =>
  1 / (1 + Math.exp(-(fit.intercept + fit.slope * margin)));

/** Power rating: expected points margin vs an average FBS team on a neutral
 *  field over ~DRIVES_PER_GAME drives, from opponent-adjusted rates. */
export function powerRating(
  team: string,
  adjER: AdjustedMetric,
  adjPPE: AdjustedMetric
): number {
  const offPPD = (adjER.offense.get(team) ?? adjER.intercept) * (adjPPE.offense.get(team) ?? adjPPE.intercept);
  const defPPD = (adjER.defense.get(team) ?? adjER.intercept) * (adjPPE.defense.get(team) ?? adjPPE.intercept);
  return DRIVES_PER_GAME * (offPPD - defPPD);
}

export function actualRecord(
  team: string,
  games: Map<number, EckelGame>
): { wins: number; losses: number } {
  let wins = 0;
  let losses = 0;
  for (const g of games.values()) {
    if (!g.completed || g.homePoints == null || g.awayPoints == null) continue;
    if (g.homeTeam !== team && g.awayTeam !== team) continue;
    const my = g.homeTeam === team ? g.homePoints : g.awayPoints;
    const their = g.homeTeam === team ? g.awayPoints : g.homePoints;
    if (my > their) wins++;
    else if (my < their) losses++;
  }
  return { wins, losses };
}
