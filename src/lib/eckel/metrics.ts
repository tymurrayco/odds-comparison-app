// src/lib/eckel/metrics.ts
//
// Drive data -> per-team-game rows -> raw season metrics.

import { EckelDrive, EckelGame, TeamGameRow } from './types';
import { isQualityDrive, isGarbageTime, drivePoints } from './classify';

/** Group non-garbage drives into one row per (game, offense). */
export function buildTeamGameRows(
  drives: EckelDrive[],
  games: Map<number, EckelGame>
): TeamGameRow[] {
  const byKey = new Map<string, TeamGameRow>();
  for (const d of drives) {
    if (isGarbageTime(d)) continue;
    const game = games.get(d.gameId);
    if (!game) continue; // non-FBS or unknown game
    const key = `${d.gameId}:${d.offense}`;
    let row = byKey.get(key);
    if (!row) {
      row = {
        gameId: d.gameId,
        week: game.week,
        offense: d.offense,
        defense: d.defense,
        homeOffense: game.homeTeam === d.offense,
        neutral: game.neutralSite,
        drives: 0,
        qualityDrives: 0,
        qualityPoints: 0,
      };
      byKey.set(key, row);
    }
    row.drives += 1;
    if (isQualityDrive(d)) {
      row.qualityDrives += 1;
      row.qualityPoints += drivePoints(d);
    }
  }
  return [...byKey.values()];
}

export interface RawTeamAgg {
  team: string;
  games: Set<number>;
  offDrives: number;
  offQuality: number;
  offQualityPoints: number;
  defDrives: number;
  defQuality: number;
  defQualityPoints: number;
  /** per-game Eckel ratios, averaged at the end */
  gameRatios: number[];
}

/** Aggregate team-game rows into raw season-to-date totals per team. */
export function aggregateRaw(rows: TeamGameRow[]): Map<string, RawTeamAgg> {
  const teams = new Map<string, RawTeamAgg>();
  const get = (team: string): RawTeamAgg => {
    let t = teams.get(team);
    if (!t) {
      t = {
        team,
        games: new Set(),
        offDrives: 0,
        offQuality: 0,
        offQualityPoints: 0,
        defDrives: 0,
        defQuality: 0,
        defQualityPoints: 0,
        gameRatios: [],
      };
      teams.set(team, t);
    }
    return t;
  };

  // index opposing rows for the per-game Eckel Ratio
  const byGame = new Map<number, TeamGameRow[]>();
  for (const r of rows) {
    const list = byGame.get(r.gameId) || [];
    list.push(r);
    byGame.set(r.gameId, list);
  }

  for (const r of rows) {
    const off = get(r.offense);
    off.games.add(r.gameId);
    off.offDrives += r.drives;
    off.offQuality += r.qualityDrives;
    off.offQualityPoints += r.qualityPoints;

    const def = get(r.defense);
    def.games.add(r.gameId);
    def.defDrives += r.drives;
    def.defQuality += r.qualityDrives;
    def.defQualityPoints += r.qualityPoints;

    const opp = (byGame.get(r.gameId) || []).find((x) => x.offense === r.defense);
    const own = r.qualityDrives;
    const theirs = opp ? opp.qualityDrives : 0;
    if (own + theirs > 0) off.gameRatios.push(own / (own + theirs));
  }
  return teams;
}

export const safeDiv = (num: number, den: number): number => (den > 0 ? num / den : 0);
