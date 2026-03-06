// src/app/ratings/utils/tournamentProjection.ts

import { projectSpread, formatSpread } from '@/lib/ratings/engine';
import type { BracketMatchup, BracketTeam, BracketTemplate } from '../types/tournament';

// ============================================
// Win Probability
// ============================================

/**
 * Convert a projected spread to a win probability for the favored team.
 * Uses logistic function: P(top wins) = 1 / (1 + exp(-0.17 * spread))
 * where spread is from top team's perspective (negative = top favored).
 *
 * Returns probability that the TOP team wins (0-1).
 */
export function spreadToWinProb(spread: number): number {
  // spread is from "home" perspective in projectSpread, but here
  // we pass it as topTeam spread. Negative = top is favored.
  // We want P(top wins), so negate: if spread is -7 (top favored by 7),
  // exponent = -0.17 * 7 = -1.19, P = 1/(1+exp(-1.19)) ≈ 0.77
  return 1 / (1 + Math.exp(-0.17 * (-spread)));
}

/**
 * Format win probability as percentage string
 */
export function formatWinProb(prob: number): string {
  return `${Math.round(prob * 100)}%`;
}

// ============================================
// Bracket Building
// ============================================

/**
 * Build initial matchups from a template and seeded teams.
 * Seeds teams into template slots and creates BracketMatchup array.
 */
export function buildMatchups(
  template: BracketTemplate,
  teams: BracketTeam[],
): BracketMatchup[] {
  const teamBySeed = new Map<number, BracketTeam>();
  for (const team of teams) {
    teamBySeed.set(team.seed, team);
  }

  const matchups: BracketMatchup[] = [];

  for (const round of template.rounds) {
    for (const tm of round.matchups) {
      const matchup: BracketMatchup = {
        id: tm.id,
        round: round.round,
        position: matchups.filter(m => m.round === round.round).length,
        topTeam: tm.topSeed ? teamBySeed.get(tm.topSeed) || null : null,
        bottomTeam: tm.bottomSeed ? teamBySeed.get(tm.bottomSeed) || null : null,
        projectedSpread: null,
        winProbTop: null,
        winner: null,
        isManualOverride: false,
        sourceMatchupIds: [tm.topFromMatchup, tm.bottomFromMatchup],
      };
      matchups.push(matchup);
    }
  }

  return matchups;
}

/**
 * Get the winner team from a matchup
 */
function getWinner(matchup: BracketMatchup): BracketTeam | null {
  if (!matchup.winner) return null;
  return matchup.winner === 'top' ? matchup.topTeam : matchup.bottomTeam;
}

/**
 * Project all matchups round by round.
 * - For each matchup, if it has source matchups, feed winners forward
 * - If both teams present, compute spread and win probability
 * - Auto-pick the projected winner (higher win prob) unless manually overridden
 * - Manual overrides are preserved and cascade forward
 */
export function projectBracket(
  matchups: BracketMatchup[],
  hca: number,
): BracketMatchup[] {
  const matchupMap = new Map<string, BracketMatchup>();
  const result = matchups.map(m => ({ ...m }));

  // Sort by round to process in order
  const rounds = [...new Set(result.map(m => m.round))].sort((a, b) => a - b);

  for (const round of rounds) {
    const roundMatchups = result.filter(m => m.round === round);

    for (const matchup of roundMatchups) {
      // Feed winners from prior matchups
      const [topSourceId, bottomSourceId] = matchup.sourceMatchupIds;

      if (topSourceId) {
        const source = matchupMap.get(topSourceId);
        if (source) {
          matchup.topTeam = getWinner(source);
        }
      }
      if (bottomSourceId) {
        const source = matchupMap.get(bottomSourceId);
        if (source) {
          matchup.bottomTeam = getWinner(source);
        }
      }

      // Project if both teams are present
      if (matchup.topTeam && matchup.bottomTeam) {
        // Use projectSpread with neutral site (tournament games)
        // topTeam treated as "home" for spread calculation convention
        const spread = projectSpread(
          matchup.topTeam.rating,
          matchup.bottomTeam.rating,
          hca,
          true, // neutral site
        );
        matchup.projectedSpread = spread;
        matchup.winProbTop = spreadToWinProb(spread);

        // Auto-pick winner if not manually overridden
        if (!matchup.isManualOverride) {
          // Negative spread = top team favored
          matchup.winner = spread <= 0 ? 'top' : 'bottom';
        }
      } else {
        matchup.projectedSpread = null;
        matchup.winProbTop = null;
        if (!matchup.isManualOverride) {
          matchup.winner = null;
        }
      }

      matchupMap.set(matchup.id, matchup);
    }
  }

  return result;
}

/**
 * Toggle the winner of a matchup (manual override).
 * Returns new matchups array with the override applied and downstream re-projected.
 */
export function toggleMatchupWinner(
  matchups: BracketMatchup[],
  matchupId: string,
  side: 'top' | 'bottom',
  hca: number,
): BracketMatchup[] {
  const current = matchups.find(m => m.id === matchupId);
  const isUndoing = current?.isManualOverride && current?.winner === side;

  const updated = matchups.map(m => {
    if (m.id === matchupId) {
      if (isUndoing) {
        // Clicking the same winner again clears the override
        return {
          ...m,
          winner: null,
          isManualOverride: false,
          isCompleted: false,
        };
      }
      return {
        ...m,
        winner: side,
        isManualOverride: true,
      };
    }
    // Clear manual overrides for any downstream matchups that depend on this one
    // (they'll be re-projected)
    if (isDownstream(matchups, matchupId, m.id)) {
      return {
        ...m,
        winner: null,
        isManualOverride: false,
        isCompleted: false,
      };
    }
    return { ...m };
  });

  return projectBracket(updated, hca);
}

/**
 * Check if targetId is downstream (depends on) sourceId
 */
function isDownstream(
  matchups: BracketMatchup[],
  sourceId: string,
  targetId: string,
): boolean {
  const target = matchups.find(m => m.id === targetId);
  if (!target) return false;

  const [topSource, bottomSource] = target.sourceMatchupIds;
  if (topSource === sourceId || bottomSource === sourceId) return true;

  // Recurse: check if either source is downstream of sourceId
  if (topSource && isDownstream(matchups, sourceId, topSource)) return true;
  if (bottomSource && isDownstream(matchups, sourceId, bottomSource)) return true;

  return false;
}

/**
 * Reset all manual overrides and re-project from scratch
 */
export function resetProjections(
  matchups: BracketMatchup[],
  hca: number,
): BracketMatchup[] {
  const cleared = matchups.map(m => ({
    ...m,
    winner: null,
    isManualOverride: false,
  }));
  return projectBracket(cleared, hca);
}

// ============================================
// Tournament Win Probabilities
// ============================================

/**
 * Calculate each team's probability of winning the tournament.
 * Uses analytical round-by-round probability propagation.
 * Completed or manually picked matchups are treated as settled (100% for the winner).
 * Returns a map of teamName -> win probability (0-1).
 */
export function calculateTournamentWinProbs(
  template: BracketTemplate,
  teams: BracketTeam[],
  hca: number,
  matchups?: BracketMatchup[],
): Map<string, number> {
  const teamBySeed = new Map<number, BracketTeam>();
  for (const t of teams) teamBySeed.set(t.seed, t);

  // Build lookup of settled matchups (only manually picked or completed results)
  const settledMap = new Map<string, BracketMatchup>();
  if (matchups) {
    for (const m of matchups) {
      if (m.winner && (m.isManualOverride || m.isCompleted)) {
        settledMap.set(m.id, m);
      }
    }
  }

  // For each matchup, track probability of each team being in that slot
  // Key: matchupId, Value: Map<teamName, probability>
  type SlotProbs = Map<string, number>; // teamName -> prob
  const winnerProbs = new Map<string, SlotProbs>();

  const teamsByName = new Map<string, BracketTeam>();
  for (const t of teams) teamsByName.set(t.teamName, t);

  for (const roundDef of template.rounds) {
    for (const tm of roundDef.matchups) {
      // Initialize top slot
      const top: SlotProbs = new Map();
      if (tm.topSeed) {
        const team = teamBySeed.get(tm.topSeed);
        if (team) top.set(team.teamName, 1);
      } else if (tm.topFromMatchup) {
        const source = winnerProbs.get(tm.topFromMatchup);
        if (source) for (const [name, prob] of source) top.set(name, prob);
      }

      // Initialize bottom slot
      const bottom: SlotProbs = new Map();
      if (tm.bottomSeed) {
        const team = teamBySeed.get(tm.bottomSeed);
        if (team) bottom.set(team.teamName, 1);
      } else if (tm.bottomFromMatchup) {
        const source = winnerProbs.get(tm.bottomFromMatchup);
        if (source) for (const [name, prob] of source) bottom.set(name, prob);
      }

      // Check if this matchup is settled
      const settled = settledMap.get(tm.id);
      if (settled && settled.winner) {
        const winnerTeam = settled.winner === 'top' ? settled.topTeam : settled.bottomTeam;
        const winners: SlotProbs = new Map();
        if (winnerTeam) {
          winners.set(winnerTeam.teamName, 1);
        }
        winnerProbs.set(tm.id, winners);
        continue;
      }

      // Calculate winner probabilities
      const winners: SlotProbs = new Map();

      for (const [topName, topProb] of top) {
        const topTeam = teamsByName.get(topName);
        if (!topTeam) continue;
        for (const [botName, botProb] of bottom) {
          const botTeam = teamsByName.get(botName);
          if (!botTeam) continue;
          const meetProb = topProb * botProb;
          if (meetProb === 0) continue;

          const spread = projectSpread(topTeam.rating, botTeam.rating, hca, true);
          const topWinProb = spreadToWinProb(spread);

          winners.set(topName, (winners.get(topName) || 0) + meetProb * topWinProb);
          winners.set(botName, (winners.get(botName) || 0) + meetProb * (1 - topWinProb));
        }
      }
      winnerProbs.set(tm.id, winners);
    }
  }

  // The final matchup's winner probs are the tournament win probs
  const allMatchupIds = template.rounds.flatMap(r => r.matchups.map(m => m.id));
  const finalId = allMatchupIds[allMatchupIds.length - 1];
  return winnerProbs.get(finalId) || new Map();
}

/**
 * Convert a win probability (0-1) to American odds string.
 * e.g., 0.8 -> "-400", 0.2 -> "+400"
 */
export function probToAmericanOdds(prob: number): string {
  if (prob <= 0 || prob >= 1) return prob >= 1 ? '-∞' : '+∞';
  if (prob >= 0.5) {
    // Favorite: negative odds
    const odds = Math.round(-(prob / (1 - prob)) * 100);
    return `${odds}`;
  } else {
    // Underdog: positive odds
    const odds = Math.round(((1 - prob) / prob) * 100);
    return `+${odds}`;
  }
}

/**
 * Re-export formatSpread for convenience
 */
export { formatSpread };

/**
 * Format the spread line for a matchup card display.
 * Returns e.g. "Duke -12.5" or null if no spread.
 */
export function formatMatchupSpread(matchup: BracketMatchup): string | null {
  if (matchup.projectedSpread === null || !matchup.topTeam || !matchup.bottomTeam) {
    return null;
  }
  const spread = matchup.projectedSpread;
  // Negative spread = top team favored
  if (spread <= 0) {
    return `${matchup.topTeam.teamName} ${formatSpread(spread)}`;
  } else {
    return `${matchup.bottomTeam.teamName} ${formatSpread(-spread)}`;
  }
}
