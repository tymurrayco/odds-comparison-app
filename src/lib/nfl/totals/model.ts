// src/lib/nfl/totals/model.ts

/**
 * NFL totals Ledger — the pure math. Two layers per team:
 *
 * FUNDAMENTALS (from box scores): pace = offensive plays per game, offPpp =
 * points per play, defPpp = points per play allowed. Season-to-date numbers
 * are blended with a prior (last season regressed toward league average):
 *   w = games / (games + k);  value = w·season + (1 − w)·prior
 *
 * MARKET TERM (points): what the market prices into a team's games that the
 * box scores don't show. Seeded by least squares against the preseason
 * posted totals, then moved by closing totals.
 *
 * PROJECTION:
 *   plays    = (paceA + paceB) / 2
 *   ptsA     = plays × (offA + defB − leagueAvgPpp)
 *   total    = ptsA + ptsB + mA + mB
 *
 * UPDATE: miss = close − projected; each team's term += miss / 2. Not
 * zero-sum — a high close says both teams' games run hotter.
 */

import type { TeamGameStats } from '@/lib/football/boxScores';

export interface TotalsParams {
  leagueAvgPace: number;
  leagueAvgPpp: number;
  blendK: number;
  priorRegress: number;
}

export interface TeamPrior {
  pace: number;
  offPpp: number;
  defPpp: number;
}

export interface TeamFundamentals extends TeamPrior {
  games: number; // season games behind the blend
}

export interface TotalsProjection {
  plays: number;
  homePts: number;
  awayPts: number;
  fundTotal: number;
  projected: number; // fundTotal + both market terms, 1dp
}

const round = (v: number, places: number) => {
  const f = Math.pow(10, places);
  return Math.round(v * f) / f;
};

// ---------- fundamentals ----------

/** Raw per-team season aggregates (regular + postseason only). */
export function rawTeamStats(
  rows: TeamGameStats[],
  teamEspnId: string,
  beforeIso?: string
): { games: number; pace: number; offPpp: number; defPpp: number } | null {
  const oppPlaysByGame = new Map<string, number | null>();
  for (const r of rows) {
    if (r.opponentEspnId === teamEspnId) oppPlaysByGame.set(r.gameId, r.plays);
  }
  let games = 0;
  let plays = 0;
  let pts = 0;
  let oppPts = 0;
  let oppPlays = 0;
  for (const r of rows) {
    if (r.teamEspnId !== teamEspnId) continue;
    if (r.seasonType === 1) continue;
    if (beforeIso && r.gameDate >= beforeIso) continue;
    const op = oppPlaysByGame.get(r.gameId);
    if (r.plays === null || op === null || op === undefined) continue;
    games++;
    plays += r.plays;
    pts += r.points;
    oppPts += r.oppPoints;
    oppPlays += op;
  }
  if (games === 0 || plays === 0 || oppPlays === 0) return null;
  return { games, pace: plays / games, offPpp: pts / plays, defPpp: oppPts / oppPlays };
}

/** League-wide averages from a season's rows (each game counted from both sides). */
export function leagueAverages(rows: TeamGameStats[]): { pace: number; ppp: number } | null {
  let games = 0;
  let plays = 0;
  let pts = 0;
  for (const r of rows) {
    if (r.seasonType === 1 || r.plays === null) continue;
    games++;
    plays += r.plays;
    pts += r.points;
  }
  if (games === 0 || plays === 0) return null;
  return { pace: plays / games, ppp: pts / plays };
}

/** Prior-season numbers pulled `regress` of the way toward league average. */
export function regressPrior(
  raw: { pace: number; offPpp: number; defPpp: number } | null,
  lg: { pace: number; ppp: number },
  regress: number
): TeamPrior {
  if (!raw) return { pace: lg.pace, offPpp: lg.ppp, defPpp: lg.ppp };
  const keep = 1 - regress;
  return {
    pace: round(lg.pace + keep * (raw.pace - lg.pace), 2),
    offPpp: round(lg.ppp + keep * (raw.offPpp - lg.ppp), 4),
    defPpp: round(lg.ppp + keep * (raw.defPpp - lg.ppp), 4),
  };
}

/** Blend season-to-date stats with the prior: w = games / (games + k). */
export function blendFundamentals(
  prior: TeamPrior,
  season: { games: number; pace: number; offPpp: number; defPpp: number } | null,
  k: number
): TeamFundamentals {
  if (!season || season.games === 0) return { ...prior, games: 0 };
  const w = season.games / (season.games + k);
  return {
    games: season.games,
    pace: round(w * season.pace + (1 - w) * prior.pace, 2),
    offPpp: round(w * season.offPpp + (1 - w) * prior.offPpp, 4),
    defPpp: round(w * season.defPpp + (1 - w) * prior.defPpp, 4),
  };
}

// ---------- projection + update ----------

export function projectTotal(
  home: TeamPrior,
  away: TeamPrior,
  homeTerm: number,
  awayTerm: number,
  leagueAvgPpp: number
): TotalsProjection {
  const plays = round((home.pace + away.pace) / 2, 2);
  const homePts = round(plays * (home.offPpp + away.defPpp - leagueAvgPpp), 2);
  const awayPts = round(plays * (away.offPpp + home.defPpp - leagueAvgPpp), 2);
  const fundTotal = round(homePts + awayPts, 2);
  return { plays, homePts, awayPts, fundTotal, projected: round(fundTotal + homeTerm + awayTerm, 1) };
}

/** Half the miss to each team. Returns the shared adjustment (2dp). */
export function totalsAdjustment(closingTotal: number, projected: number): { difference: number; adjustment: number } {
  const difference = round(closingTotal - projected, 2);
  return { difference, adjustment: round(difference / 2, 2) };
}

// ---------- seed fit ----------

export interface TotalLine {
  home: string; // team key (name)
  away: string;
  total: number;
  books: number;
}

/**
 * Solve each team's market term so fundamentals + terms fit the posted
 * totals: residual_g = total_g − fundTotal_g = m_home + m_away. Weighted
 * least squares (sqrt of book count) with a light ridge toward zero — the
 * schedule graph has odd cycles so sums are identifiable, the ridge just
 * keeps a thinly-connected team from swinging on one number.
 */
export function fitMarketTerms(
  lines: TotalLine[],
  fundamentals: Map<string, TeamPrior>,
  leagueAvgPpp: number,
  ridge = 0.05
): { terms: Map<string, number>; rmse: number; games: number } {
  const usable = lines.filter((l) => fundamentals.has(l.home) && fundamentals.has(l.away));
  const teams = [...new Set(usable.flatMap((l) => [l.home, l.away]))].sort();
  const idx = new Map(teams.map((t, i) => [t, i]));
  const n = teams.length;
  const A: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const b = new Array<number>(n).fill(0);
  const residuals: Array<{ h: number; a: number; r: number; w: number }> = [];
  for (const l of usable) {
    const proj = projectTotal(fundamentals.get(l.home)!, fundamentals.get(l.away)!, 0, 0, leagueAvgPpp);
    const r = l.total - proj.fundTotal;
    const h = idx.get(l.home)!;
    const a = idx.get(l.away)!;
    const w = Math.sqrt(Math.max(l.books, 1));
    residuals.push({ h, a, r, w });
    for (const i of [h, a]) {
      A[i][h] += w;
      A[i][a] += w;
      b[i] += w * r;
    }
  }
  for (let i = 0; i < n; i++) A[i][i] += ridge;

  // Gauss-Jordan
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const pivot = M[c][c];
    if (Math.abs(pivot) < 1e-12) throw new Error('Totals fit is singular — not enough lined games');
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / pivot;
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const sol = M.map((row, i) => row[n] / row[i]);
  const terms = new Map<string, number>();
  teams.forEach((t, i) => terms.set(t, round(sol[i], 2)));
  let se = 0;
  for (const { h, a, r } of residuals) se += (r - sol[h] - sol[a]) ** 2;
  return { terms, rmse: residuals.length ? Math.sqrt(se / residuals.length) : 0, games: residuals.length };
}
