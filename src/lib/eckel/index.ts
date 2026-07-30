// src/lib/eckel/index.ts
//
// Orchestrator: raw CFBD drives + games in, EckelSnapshot out.

import { EckelDrive, EckelGame, EckelSnapshot, TeamSeasonMetrics } from './types';
import { buildTeamGameRows, aggregateRaw, safeDiv } from './metrics';
import { isGarbageTime } from './classify';
import { ridgeAdjust, rowEckelRate, rowPointsPerEckel } from './adjust';
import {
  buildGameExpectations,
  fitLogistic,
  winProb,
  powerRating,
  actualRecord,
} from './ratings';
import { DRIVES_PER_GAME } from './constants';

export * from './types';
export * from './constants';
export * from './classify';

export function computeEckel(
  drives: EckelDrive[],
  gamesList: EckelGame[],
  season: number,
  week: number | null = null
): EckelSnapshot {
  const games = new Map(gamesList.map((g) => [g.id, g]));
  const fbsGameIds = new Set(games.keys());
  const usable = drives.filter((d) => fbsGameIds.has(d.gameId));
  const garbage = usable.filter((d) => isGarbageTime(d)).length;

  const rows = buildTeamGameRows(usable, games);
  const aggs = aggregateRaw(rows);

  const adjER = ridgeAdjust(rows, rowEckelRate);
  const adjPPE = ridgeAdjust(rows, rowPointsPerEckel);

  const expectations = buildGameExpectations(rows, aggs, games);
  const decided = expectations.filter((e) => e.won !== null);
  const logistic = fitLogistic(decided.map((e) => ({ x: e.expectedMargin, y: e.won ? 1 : 0 })));

  const teams: TeamSeasonMetrics[] = [];
  for (const agg of aggs.values()) {
    const record = actualRecord(agg.team, games);
    const myExpectations = decided.filter((e) => e.team === agg.team);
    const xWins = myExpectations.reduce((s, e) => s + winProb(e.expectedMargin, logistic), 0);
    teams.push({
      team: agg.team,
      games: agg.games.size,
      eckelRateOff: safeDiv(agg.offQuality, agg.offDrives),
      eckelRateDef: safeDiv(agg.defQuality, agg.defDrives),
      pointsPerEckelOff: safeDiv(agg.offQualityPoints, agg.offQuality),
      pointsPerEckelDef: safeDiv(agg.defQualityPoints, agg.defQuality),
      eckelRatio: agg.gameRatios.length
        ? agg.gameRatios.reduce((a, b) => a + b, 0) / agg.gameRatios.length
        : 0,
      expectedMarginPerGame: myExpectations.length
        ? myExpectations.reduce((s, e) => s + e.expectedMargin, 0) / myExpectations.length
        : 0,
      adjEckelRateOff: adjER.offense.get(agg.team) ?? 0,
      adjEckelRateDef: adjER.defense.get(agg.team) ?? 0,
      adjPointsPerEckelOff: adjPPE.offense.get(agg.team) ?? 0,
      adjPointsPerEckelDef: adjPPE.defense.get(agg.team) ?? 0,
      wins: record.wins,
      losses: record.losses,
      xWins: Math.round(xWins * 100) / 100,
      luckDelta: Math.round((record.wins - xWins) * 100) / 100,
      powerRating: Math.round(powerRating(agg.team, adjER, adjPPE) * 100) / 100,
    });
  }
  teams.sort((a, b) => b.powerRating - a.powerRating);

  // Sanity checks against known reference points.
  const validation: string[] = [];
  const eligible = teams.filter((t) => t.games >= 6);
  if (eligible.length) {
    const topOffenses = [...eligible].sort((a, b) => b.eckelRateOff - a.eckelRateOff).slice(0, 5);
    const eliteER = topOffenses[0]?.eckelRateOff ?? 0;
    if (eliteER < 0.5 || eliteER > 0.75) {
      validation.push(
        `Elite Eckel Rate looks off: best offense ${(eliteER * 100).toFixed(1)}% (expected ~55-60%+)`
      );
    }
    const allPPE = eligible.map((t) => t.pointsPerEckelOff).filter((v) => v > 0);
    const avgPPE = allPPE.reduce((a, b) => a + b, 0) / (allPPE.length || 1);
    if (avgPPE < 3.2 || avgPPE > 4.5) {
      validation.push(
        `National avg Points per Eckel ${avgPPE.toFixed(2)} outside expected 3.5-4.0 band`
      );
    }
    const topPower = Math.abs(teams[0]?.powerRating ?? 0);
    if (topPower > 45) {
      validation.push(`Top power rating ${teams[0].powerRating} implausibly large`);
    }
  } else {
    validation.push('Fewer than 6 games per team — early-season noise, treat with caution');
  }

  // HFA in expected points: hfa(ER)*PPE_avg + hfa(PPE)*ER_avg, per game.
  const hfaPoints =
    DRIVES_PER_GAME * (adjER.hfa * adjPPE.intercept + adjPPE.hfa * adjER.intercept);
  // Real CFB home-field is ~2-3.5 points; a big fitted HFA usually means
  // non-FBS buy games (systematically FBS home blowouts) leaked in.
  if (hfaPoints > 5 || hfaPoints < 0) {
    validation.push(`Fitted HFA ${hfaPoints.toFixed(1)} pts outside the plausible 1-4 band`);
  }

  return {
    season,
    week,
    computedAt: new Date().toISOString(),
    teams,
    validation,
    meta: {
      games: games.size,
      drives: usable.length,
      garbageDrivesExcluded: garbage,
      hfaPoints: Math.round(hfaPoints * 100) / 100,
      logistic,
    },
  };
}
