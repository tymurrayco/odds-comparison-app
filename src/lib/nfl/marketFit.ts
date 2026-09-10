// src/lib/nfl/marketFit.ts

/**
 * Market-implied NFL power ratings — the Ledger's preseason seed.
 *
 * The books post spreads for the whole regular season before Week 1
 * (DraftKings all 17 weeks, the other consensus books ~2 weeks out). With
 * ~240 lined games over 32 teams that's an overdetermined system:
 *
 *   line_home = r_away - r_home - HFA·(1 - neutral)
 *
 * solved by weighted least squares (weight = sqrt(book count)) with the
 * ratings constrained to sum to zero — so a rating reads "points better than
 * a league-average team on a neutral field". The 2026 fit reproduces the
 * posted lines to 0.64 RMSE; Sagarin's starting ratings sit at 1.43 and a
 * hand-built market set at 1.85 against the same lines, which is why the fit
 * seeds and the others only fill gaps.
 *
 * Gap filling: a team with no lined game (Week 1 already played, nothing
 * posted beyond it) gets Sagarin's starting rating mapped onto the fit's
 * scale by a straight-line regression across the lined teams.
 *
 * Neutral games come from ESPN's season scoreboard (international games plus
 * the Super Bowl); the Odds API marks one side "home" regardless.
 */

import {
  ESPN_NFL_SCOREBOARD_URL,
  ESPN_NFL_TEAMS_URL,
  NFL_CONSENSUS_BOOKS,
  NFL_DIVISIONS,
  NFL_SEASON_DATES,
  NFL_SPORT_KEY,
  ODDS_API_BASE_URL,
  SAGARIN_NFL_URL,
} from './constants';
import { roundToDecimal } from './engine';
import { EspnTeam, matchNflTeam, normalizeName } from './teamNames';
import { PowerRatingRow } from '@/lib/powerRatings';

export interface LinedGame {
  home: string; // ESPN displayName
  away: string;
  line: number; // home perspective, consensus average
  books: number;
  neutral: boolean;
  date: string; // YYYY-MM-DD
}

export interface MarketFitResult {
  ratings: Map<string, number>; // ESPN displayName -> rating (sum 0)
  hfa: number;
  rmse: number;
  games: number;
  teamsLined: number;
}

interface OddsEvent {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: Array<{
    key: string;
    markets?: Array<{ key: string; outcomes?: Array<{ name: string; point?: number }> }>;
  }>;
}

// ---------- fetchers ----------

export async function fetchEspnNflTeams(): Promise<EspnTeam[]> {
  const res = await fetch(ESPN_NFL_TEAMS_URL);
  if (!res.ok) throw new Error(`ESPN NFL teams HTTP ${res.status}`);
  const json = await res.json();
  const teams = json?.sports?.[0]?.leagues?.[0]?.teams ?? [];
  return teams.map((t: { team: Record<string, string> }) => ({
    id: String(t.team.id),
    location: t.team.location ?? '',
    displayName: t.team.displayName ?? '',
    shortDisplayName: t.team.shortDisplayName ?? '',
    nickname: t.team.name ?? t.team.nickname ?? '',
    abbreviation: t.team.abbreviation ?? '',
  }));
}

/** Season-long neutral-site games keyed "away|home" (ESPN displayNames). */
export async function fetchNeutralGameKeys(season: number): Promise<Set<string>> {
  const dates = NFL_SEASON_DATES[season];
  if (!dates) return new Set();
  const range = `${dates.start.replace(/-/g, '')}-${dates.end.replace(/-/g, '')}`;
  const res = await fetch(`${ESPN_NFL_SCOREBOARD_URL}?dates=${range}&limit=1000`);
  if (!res.ok) throw new Error(`ESPN NFL scoreboard HTTP ${res.status}`);
  const json = await res.json();
  const keys = new Set<string>();
  for (const event of json.events ?? []) {
    const comp = event.competitions?.[0];
    if (!comp) continue;
    const neutral = comp.neutralSite === true || comp.venue?.neutral === true;
    if (!neutral) continue;
    const home = comp.competitors?.find((c: { homeAway: string }) => c.homeAway === 'home');
    const away = comp.competitors?.find((c: { homeAway: string }) => c.homeAway === 'away');
    if (!home?.team?.displayName || !away?.team?.displayName) continue;
    keys.add(`${normalizeName(away.team.displayName)}|${normalizeName(home.team.displayName)}`);
  }
  return keys;
}

/** Every NFL spread the consensus books currently post, one row per game. */
export async function fetchSeasonLines(
  espnTeams: EspnTeam[],
  neutralKeys: Set<string>
): Promise<{ games: LinedGame[]; unknownTeams: string[] }> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) throw new Error('ODDS_API_KEY missing');
  const url =
    `${ODDS_API_BASE_URL}/sports/${NFL_SPORT_KEY}/odds` +
    `?apiKey=${apiKey}&regions=us&markets=spreads&oddsFormat=american` +
    `&bookmakers=${NFL_CONSENSUS_BOOKS.join(',')}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Odds API HTTP ${res.status}: ${(await res.text()).slice(0, 150)}`);
  const events: OddsEvent[] = await res.json();

  const games: LinedGame[] = [];
  const unknown = new Set<string>();
  for (const ev of events) {
    const home = matchNflTeam(ev.home_team, espnTeams);
    const away = matchNflTeam(ev.away_team, espnTeams);
    if (!home) unknown.add(ev.home_team);
    if (!away) unknown.add(ev.away_team);
    if (!home || !away) continue;
    const points: number[] = [];
    for (const bk of ev.bookmakers ?? []) {
      if (!NFL_CONSENSUS_BOOKS.includes(bk.key)) continue;
      const market = bk.markets?.find((m) => m.key === 'spreads');
      const outcome = market?.outcomes?.find((o) => o.name === ev.home_team);
      if (outcome && typeof outcome.point === 'number') points.push(outcome.point);
    }
    if (points.length === 0) continue;
    const key = `${normalizeName(away.displayName)}|${normalizeName(home.displayName)}`;
    games.push({
      home: home.displayName,
      away: away.displayName,
      line: points.reduce((a, b) => a + b, 0) / points.length,
      books: points.length,
      neutral: neutralKeys.has(key),
      date: ev.commence_time.substring(0, 10),
    });
  }
  return { games, unknownTeams: [...unknown] };
}

/**
 * Sagarin's plain-text page: the first ratings block lists every team as
 *   "   1  Los Angeles Rams        =  27.13    0   0   0 ..."
 * We take the overall RATING column (the "=" number) for the 32 NFL rows.
 */
export async function fetchSagarinNfl(
  espnTeams: EspnTeam[]
): Promise<{ ratings: Map<string, number>; hfa: number | null; unmatched: string[] }> {
  const res = await fetch(SAGARIN_NFL_URL);
  if (!res.ok) throw new Error(`Sagarin HTTP ${res.status}`);
  const text = (await res.text()).replace(/<[^>]*>/g, '');
  const ratings = new Map<string, number>();
  const unmatched: string[] = [];
  const hfaMatch = text.match(/HOME ADVANTAGE=\[\s*([\d.]+)\]/);
  const hfa = hfaMatch ? parseFloat(hfaMatch[1]) : null;
  // Name may carry digits ("San Francisco 49ers"); rank is followed by 2+ spaces
  const rowRe = /^\s*(\d{1,2})\s{2,}([A-Za-z][A-Za-z0-9 .'&-]+?)\s+=\s+(-?\d+\.\d+)/gm;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(text)) !== null) {
    const name = m[2].trim();
    const value = parseFloat(m[3]);
    const team = matchNflTeam(name, espnTeams);
    if (!team) {
      if (!unmatched.includes(name)) unmatched.push(name);
      continue;
    }
    if (!ratings.has(team.displayName)) ratings.set(team.displayName, value);
    if (ratings.size >= espnTeams.length) break;
  }
  return { ratings, hfa, unmatched };
}

// ---------- solver ----------

/** Gauss-Jordan on a small dense system (n ≤ 33). */
function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const pivot = M[c][c];
    if (Math.abs(pivot) < 1e-12) throw new Error('Market fit is singular — not enough lined games');
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / pivot;
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/**
 * Weighted least squares over the lined games. Unknowns: one rating per lined
 * team plus a league HFA; ratings constrained to sum to zero.
 */
export function solveMarketFit(games: LinedGame[]): MarketFitResult {
  const teams = [...new Set(games.flatMap((g) => [g.home, g.away]))].sort();
  const idx = new Map(teams.map((t, i) => [t, i]));
  const n = teams.length;
  if (n < 2 || games.length < n) {
    throw new Error(`Market fit needs more lined games (${games.length} games, ${n} teams)`);
  }
  const N = n + 1; // + hfa
  const A: number[][] = Array.from({ length: N }, () => new Array<number>(N).fill(0));
  const b = new Array<number>(N).fill(0);
  const addRow = (row: number[], y: number, w: number) => {
    for (let i = 0; i < N; i++) {
      if (!row[i]) continue;
      for (let j = 0; j < N; j++) if (row[j]) A[i][j] += w * row[i] * row[j];
      b[i] += w * row[i] * y;
    }
  };
  for (const g of games) {
    const row = new Array<number>(N).fill(0);
    row[idx.get(g.away)!] += 1;
    row[idx.get(g.home)!] -= 1;
    row[n] = g.neutral ? 0 : -1;
    addRow(row, g.line, Math.sqrt(g.books));
  }
  // sum(r) = 0 as a heavily weighted soft constraint
  const sumRow = new Array<number>(N).fill(1);
  sumRow[n] = 0;
  addRow(sumRow, 0, 1000);

  const sol = solveLinear(A, b);
  const hfa = sol[n];
  const ratings = new Map<string, number>();
  teams.forEach((t, i) => ratings.set(t, sol[i]));

  let se = 0;
  for (const g of games) {
    const p = ratings.get(g.away)! - ratings.get(g.home)! - (g.neutral ? 0 : hfa);
    se += (g.line - p) ** 2;
  }
  return {
    ratings,
    hfa,
    rmse: Math.sqrt(se / games.length),
    games: games.length,
    teamsLined: n,
  };
}

/** Straight-line map from one scale onto another over shared teams (least squares). */
function fitLine(pairs: Array<[number, number]>): { a: number; b: number } {
  const n = pairs.length;
  if (n < 3) return { a: 0, b: 1 };
  const mx = pairs.reduce((s, p) => s + p[0], 0) / n;
  const my = pairs.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const [x, y] of pairs) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
  }
  const b = sxx === 0 ? 1 : sxy / sxx;
  return { a: my - b * mx, b };
}

export interface SeedBuild {
  rows: PowerRatingRow[];
  fit: { hfa: number; rmse: number; games: number; teamsLined: number };
  filled: Array<{ team: string; sagarin: number; rating: number }>;
  sagarinScale: { a: number; b: number; overlap: number } | null;
  sagarinHfa: number | null;
  unknownOddsTeams: string[];
  unmatchedSagarin: string[];
  missing: string[]; // ESPN teams with neither a line nor a Sagarin rating
}

/**
 * Full seed build: season lines -> fit; Sagarin fills any unlined team on the
 * fit's scale. Rows come back sorted best-first with rank stamped.
 */
export async function buildMarketSeed(season: number): Promise<SeedBuild> {
  const espnTeams = await fetchEspnNflTeams();
  if (espnTeams.length < 30) throw new Error(`ESPN returned ${espnTeams.length} NFL teams`);
  const [neutralKeys, sagarin] = await Promise.all([
    fetchNeutralGameKeys(season),
    fetchSagarinNfl(espnTeams).catch(() => ({
      ratings: new Map<string, number>(),
      hfa: null,
      unmatched: ['(Sagarin fetch failed)'],
    })),
  ]);
  const { games, unknownTeams } = await fetchSeasonLines(espnTeams, neutralKeys);
  const fit = solveMarketFit(games);

  // Map Sagarin onto the fit scale over the teams both cover
  const pairs: Array<[number, number]> = [];
  for (const [team, r] of fit.ratings) {
    const s = sagarin.ratings.get(team);
    if (typeof s === 'number') pairs.push([s, r]);
  }
  const scale = pairs.length >= 3 ? { ...fitLine(pairs), overlap: pairs.length } : null;

  const filled: SeedBuild['filled'] = [];
  const missing: string[] = [];
  const final = new Map<string, number>();
  for (const t of espnTeams) {
    const fitted = fit.ratings.get(t.displayName);
    if (typeof fitted === 'number') {
      final.set(t.displayName, fitted);
      continue;
    }
    const s = sagarin.ratings.get(t.displayName);
    if (typeof s === 'number' && scale) {
      const r = scale.a + scale.b * s;
      final.set(t.displayName, r);
      filled.push({ team: t.displayName, sagarin: s, rating: roundToDecimal(r, 2) });
    } else {
      missing.push(t.displayName);
    }
  }
  // Re-center after fills so the league still averages zero
  const mean = [...final.values()].reduce((a, b) => a + b, 0) / Math.max(final.size, 1);
  const byAbbr = new Map(espnTeams.map((t) => [t.displayName, t.abbreviation]));
  const rows: PowerRatingRow[] = [...final.entries()]
    .map(([team, r]) => ({
      rank: null,
      team,
      lastYr: null,
      thisYr: roundToDecimal(r - mean, 2),
      conference: NFL_DIVISIONS[byAbbr.get(team) ?? ''] ?? null,
      hfa: null,
    }))
    .sort((x, y) => y.thisYr - x.thisYr)
    .map((row, i) => ({ ...row, rank: i + 1 }));

  return {
    rows,
    fit: {
      hfa: roundToDecimal(fit.hfa, 2),
      rmse: roundToDecimal(fit.rmse, 2),
      games: fit.games,
      teamsLined: fit.teamsLined,
    },
    filled,
    sagarinScale: scale
      ? { a: roundToDecimal(scale.a, 3), b: roundToDecimal(scale.b, 3), overlap: scale.overlap }
      : null,
    sagarinHfa: sagarin.hfa,
    unknownOddsTeams: unknownTeams,
    unmatchedSagarin: sagarin.unmatched,
    missing,
  };
}
