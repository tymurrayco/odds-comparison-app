// src/lib/fcs/replay.ts

/**
 * Ledger replay: reset every team to its Massey seed and re-apply the season's
 * events in chronological order. Two event kinds share the timeline:
 * - game adjustments (zero-sum half-the-difference, stored hfa reused)
 * - manual rating adjustments (single-team delta, entered by hand)
 * At an identical timestamp a manual adjustment applies before a game.
 *
 * Replay stamps rating_before/after + applied_at onto manual rows, which is
 * what clears their "pending" flag in the UI.
 */

import { projectFcsSpread, roundToDecimal } from './engine';
import {
  loadFcsAdjustments,
  loadFcsManualAdjustments,
  loadFcsRatings,
  saveFcsAdjustment,
  stampFcsManualAdjustment,
  upsertFcsRatings,
} from './supabase';
import { FcsGameAdjustment, FcsManualAdjustment } from './types';

type ReplayEvent =
  | { kind: 'game'; date: string; order: number; adj: FcsGameAdjustment }
  | { kind: 'manual'; date: string; order: number; manual: FcsManualAdjustment };

export interface ReplayResult {
  success: true;
  action: string;
  season: number;
  gamesReplayed: number;
  manualApplied: number;
  adjustmentRowsRewritten: number;
  missingTeams: string[];
}

export async function replayLedger(
  season: number,
  saveFromDate?: string
): Promise<ReplayResult> {
  const [ratings, adjustments, manuals] = await Promise.all([
    loadFcsRatings(season),
    loadFcsAdjustments(season),
    loadFcsManualAdjustments(season),
  ]);

  for (const r of ratings.values()) {
    r.rating = r.initialRating;
    r.gamesProcessed = 0;
  }

  const events: ReplayEvent[] = [
    ...manuals.map((m): ReplayEvent => ({ kind: 'manual', date: m.adjustDate, order: 0, manual: m })),
    ...adjustments.map((a): ReplayEvent => ({ kind: 'game', date: a.gameDate, order: 1, adj: a })),
  ].sort(
    (x, y) =>
      x.date.localeCompare(y.date) ||
      x.order - y.order ||
      (x.kind === 'game' && y.kind === 'game'
        ? x.adj.gameId.localeCompare(y.adj.gameId)
        : x.kind === 'manual' && y.kind === 'manual'
          ? x.manual.id - y.manual.id
          : 0)
  );

  let rewritten = 0;
  let manualApplied = 0;
  const missingTeams: string[] = [];

  for (const ev of events) {
    if (ev.kind === 'manual') {
      const team = ratings.get(ev.manual.teamName);
      if (!team) {
        missingTeams.push(`manual: ${ev.manual.teamName}`);
        continue;
      }
      const before = team.rating;
      team.rating = roundToDecimal(team.rating + ev.manual.delta, 2);
      await stampFcsManualAdjustment(ev.manual.id, before, team.rating);
      manualApplied++;
      continue;
    }

    const adj = ev.adj;
    const home = ratings.get(adj.homeTeam);
    const away = ratings.get(adj.awayTeam);
    if (!home || !away) {
      missingTeams.push(`${adj.awayTeam} @ ${adj.homeTeam}`);
      continue;
    }
    // Keep the hfa that was applied when the game was processed live — the
    // line closed under that condition, and replays must be deterministic
    // (a Massey metadata refresh must not silently shift the whole ledger).
    const hfaApplied = adj.hfaApplied;
    const projected = projectFcsSpread(home.rating, away.rating, hfaApplied);
    const difference = roundToDecimal(adj.closingSpread - projected, 2);
    const adjustment = roundToDecimal(difference / 2, 2);

    adj.hfaApplied = hfaApplied;
    adj.projectedSpread = projected;
    adj.difference = difference;
    adj.adjustment = adjustment;
    adj.homeRatingBefore = home.rating;
    adj.awayRatingBefore = away.rating;
    away.rating = roundToDecimal(away.rating + adjustment, 2);
    home.rating = roundToDecimal(home.rating - adjustment, 2);
    away.gamesProcessed += 1;
    home.gamesProcessed += 1;
    adj.homeRatingAfter = home.rating;
    adj.awayRatingAfter = away.rating;

    if (!saveFromDate || adj.gameDate.substring(0, 10) >= saveFromDate) {
      await saveFcsAdjustment(adj);
      rewritten++;
    }
  }

  const now = new Date().toISOString();
  for (const r of ratings.values()) r.updatedAt = now;
  await upsertFcsRatings([...ratings.values()]);

  return {
    success: true,
    action: saveFromDate ? 'recalculate-from' : 'recalculate',
    season,
    gamesReplayed: adjustments.length,
    manualApplied,
    adjustmentRowsRewritten: rewritten,
    missingTeams,
  };
}
