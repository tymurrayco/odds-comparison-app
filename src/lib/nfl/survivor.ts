// src/lib/nfl/survivor.ts

/**
 * NFL survivor planner (Splash × Polymarket 2026 contest).
 *
 * Contest: one pick a week for 12 weeks, TWO picks in weeks 9 and 12–16,
 * one pick in weeks 17–18; a team can be used once. Picks lock Sunday 1pm
 * ET. Survive the season by never picking a loser.
 *
 * Every game's win probability comes from the Ledger spread (rating gap +
 * home edge) through a normal CDF with the NFL margin spread (σ = 13).
 * The planner then assigns unused teams to the remaining pick slots to
 * maximise the probability of surviving every remaining week — the product
 * of the picks' win probabilities, i.e. a maximum-weight assignment on
 * log-probabilities, solved exactly with the Hungarian algorithm. Picks
 * you've already made (or locked in for a future week) are honoured as
 * constraints; a team used once is unavailable everywhere else.
 */

import { fetchNflSeasonEvents } from './espnSchedule';
import { hfaForGame, projectNflSpread } from './engine';
import { NflTeamRating } from './types';
import { normalCdf } from '@/lib/fbs/futures';

export const SURVIVOR_SIGMA = 13;
export const SURVIVOR_WEEKS = 18;
export const DOUBLE_PICK_WEEKS = new Set([9, 12, 13, 14, 15, 16]);
export const picksRequired = (week: number) => (DOUBLE_PICK_WEEKS.has(week) ? 2 : 1);

export interface SurvivorGame {
  id: string;
  week: number;
  date: string;
  home: string; // ESPN displayName (= ratings team_name)
  away: string;
  neutral: boolean;
  completed: boolean;
  homeScore: number | null;
  awayScore: number | null;
  spread: number | null;   // home perspective, from the Ledger
  homeProb: number | null; // P(home wins)
}

export interface SurvivorOption {
  team: string;
  opponent: string;
  home: boolean;
  neutral: boolean;
  prob: number;
  spread: number; // from the team's perspective (negative = favored)
  gameId: string;
  date: string;
  started: boolean; // kickoff has passed — can still be recorded, never planned
}

export interface SurvivorPick {
  week: number;
  slot: number;
  team: string;
  result: 'won' | 'lost' | 'pending' | 'unknown'; // vs the game the team played that week
  option: SurvivorOption | null;
}

export interface SurvivorWeek {
  week: number;
  required: number;
  picks: SurvivorPick[];               // what you've entered
  recommended: SurvivorOption[];       // planner's picks for open slots (empty if locked/past)
  options: SurvivorOption[];           // every eligible team this week, best first
  locked: boolean;                     // week is in the past (or in progress)
  weekProb: number | null;             // product of the week's chosen picks' probabilities
}

export interface SurvivorPlan {
  season: number;
  currentWeek: number;
  homeOnly: boolean;
  weeks: SurvivorWeek[];
  usedTeams: string[];
  survivalProb: number | null;         // product over open weeks of planner picks (given past picks survived)
  infeasible: string[];                // weeks the planner could not fill
}

/* eslint-disable @typescript-eslint/no-explicit-any */

let scheduleCache: { season: number; at: number; games: SurvivorGame[] } | null = null;
const SCHEDULE_TTL_MS = 5 * 60 * 1000;

export async function fetchNflSeasonGames(season: number): Promise<SurvivorGame[]> {
  if (scheduleCache && scheduleCache.season === season && Date.now() - scheduleCache.at < SCHEDULE_TTL_MS) {
    return scheduleCache.games;
  }
  // Regular season only, fetched week by week (ESPN no longer accepts date ranges)
  const events = await fetchNflSeasonEvents(season, [2]);
  const games: SurvivorGame[] = [];
  for (const event of events) {
    if (Number(event.season?.type) !== 2) continue; // regular season only
    const comp = event.competitions?.[0];
    const home = comp?.competitors?.find((c: any) => c.homeAway === 'home');
    const away = comp?.competitors?.find((c: any) => c.homeAway === 'away');
    if (!comp || !home?.team?.displayName || !away?.team?.displayName) continue;
    const week = Number(event.week?.number ?? 0);
    if (!week) continue;
    const completed = comp.status?.type?.completed === true;
    games.push({
      id: String(event.id),
      week,
      date: comp.date ?? event.date,
      home: home.team.displayName,
      away: away.team.displayName,
      neutral: comp.neutralSite === true || comp.venue?.neutral === true,
      completed,
      homeScore: completed ? Number(home.score) : null,
      awayScore: completed ? Number(away.score) : null,
      spread: null,
      homeProb: null,
    });
  }
  games.sort((a, b) => a.week - b.week || a.date.localeCompare(b.date));
  scheduleCache = { season, at: Date.now(), games };
  return games;
}

// ---------- Hungarian (min-cost assignment, square matrix) ----------

function hungarian(cost: number[][]): number[] {
  const n = cost.length;
  const INF = Number.POSITIVE_INFINITY;
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(n + 1).fill(0);
  const p = new Array<number>(n + 1).fill(0);
  const way = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(n + 1).fill(INF);
    const used = new Array<boolean>(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
        else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const assign = new Array<number>(n).fill(-1); // row -> col
  for (let j = 1; j <= n; j++) if (p[j] > 0) assign[p[j] - 1] = j - 1;
  return assign;
}

// ---------- plan ----------

export function buildSurvivorPlan(
  season: number,
  games: SurvivorGame[],
  ratings: Map<string, NflTeamRating>,
  hfaDefault: number,
  picks: Array<{ week: number; slot: number; team: string }>,
  homeOnly: boolean,
  now: Date = new Date()
): SurvivorPlan {
  // Price every game
  for (const g of games) {
    const h = ratings.get(g.home);
    const a = ratings.get(g.away);
    if (!h || !a) continue;
    const hfa = hfaForGame(h, g.neutral, hfaDefault);
    g.spread = projectNflSpread(h.rating, a.rating, hfa);
    g.homeProb = normalCdf(-g.spread / SURVIVOR_SIGMA);
  }

  // Current week = first week with a game not yet completed and not kicked off... use
  // the first week whose games are not all completed.
  const byWeek = new Map<number, SurvivorGame[]>();
  for (const g of games) {
    if (!byWeek.has(g.week)) byWeek.set(g.week, []);
    byWeek.get(g.week)!.push(g);
  }
  let currentWeek = SURVIVOR_WEEKS;
  for (let w = 1; w <= SURVIVOR_WEEKS; w++) {
    const gs = byWeek.get(w) ?? [];
    if (gs.some((g) => !g.completed)) { currentWeek = w; break; }
  }

  const optionsFor = (week: number): SurvivorOption[] => {
    const out: SurvivorOption[] = [];
    for (const g of byWeek.get(week) ?? []) {
      if (g.homeProb === null || g.spread === null) continue;
      const started = g.completed || new Date(g.date) <= now;
      out.push({ team: g.home, opponent: g.away, home: true, neutral: g.neutral, prob: g.homeProb, spread: g.spread, gameId: g.id, date: g.date, started });
      out.push({ team: g.away, opponent: g.home, home: false, neutral: g.neutral, prob: 1 - g.homeProb, spread: -g.spread, gameId: g.id, date: g.date, started });
    }
    return out.sort((x, y) => y.prob - x.prob);
  };

  const resultFor = (week: number, team: string): SurvivorPick['result'] => {
    const g = (byWeek.get(week) ?? []).find((x) => x.home === team || x.away === team);
    if (!g) return 'unknown';
    if (!g.completed || g.homeScore === null || g.awayScore === null) return 'pending';
    const won = g.home === team ? g.homeScore > g.awayScore : g.awayScore > g.homeScore;
    return won ? 'won' : 'lost';
  };

  const used = new Set<string>(picks.map((p) => p.team));
  const weeks: SurvivorWeek[] = [];
  const openSlots: Array<{ week: number; slot: number }> = [];
  for (let w = 1; w <= SURVIVOR_WEEKS; w++) {
    const required = picksRequired(w);
    const opts = optionsFor(w);
    const mine = picks
      .filter((p) => p.week === w)
      .sort((a, b) => a.slot - b.slot)
      .map((p) => ({
        week: w, slot: p.slot, team: p.team, result: resultFor(w, p.team),
        option: opts.find((o) => o.team === p.team) ?? null,
      }));
    // A week is locked once its games have started (kickoff passed) — you
    // can still record what you picked, the planner just won't touch it.
    const gs = byWeek.get(w) ?? [];
    const firstKick = gs.length ? gs.map((g) => g.date).sort()[0] : null;
    const locked = w < currentWeek || (!!firstKick && new Date(firstKick) <= now && gs.every((g) => g.completed));
    if (!locked) {
      for (let s = mine.length + 1; s <= required; s++) openSlots.push({ week: w, slot: s });
    }
    weeks.push({ week: w, required, picks: mine, recommended: [], options: opts, locked, weekProb: null });
  }

  // Candidate teams = every rated team not already used
  const teams = [...ratings.keys()].filter((t) => !used.has(t)).sort();
  const infeasible: string[] = [];
  if (openSlots.length > 0 && teams.length > 0) {
    const n = Math.max(openSlots.length, teams.length);
    const BIG = 1e6;
    const cost: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    for (let i = 0; i < openSlots.length; i++) {
      const wk = weeks[openSlots[i].week - 1];
      for (let j = 0; j < teams.length; j++) {
        const o = wk.options.find((x) => x.team === teams[j] && !x.started && (!homeOnly || x.home));
        cost[i][j] = o && o.prob > 0 ? -Math.log(o.prob) : BIG;
      }
      for (let j = teams.length; j < n; j++) cost[i][j] = BIG; // padding "teams"
    }
    // padding slots (rows beyond openSlots) cost 0 for any team
    const assign = hungarian(cost);
    for (let i = 0; i < openSlots.length; i++) {
      const j = assign[i];
      const wk = weeks[openSlots[i].week - 1];
      const o = j >= 0 && j < teams.length ? wk.options.find((x) => x.team === teams[j] && !x.started && (!homeOnly || x.home)) : undefined;
      if (o) wk.recommended.push(o);
      else infeasible.push(`Week ${openSlots[i].week} slot ${openSlots[i].slot}`);
    }
  }

  let survival: number | null = null;
  for (const wk of weeks) {
    const chosen = [...wk.picks.filter((p) => p.result === 'pending' || !wk.locked).map((p) => p.option), ...wk.recommended];
    const probs = chosen.filter((o): o is SurvivorOption => !!o).map((o) => o.prob);
    if (probs.length === 0) { wk.weekProb = wk.locked && wk.picks.length ? (wk.picks.every((p) => p.result === 'won') ? 1 : wk.picks.some((p) => p.result === 'lost') ? 0 : null) : null; continue; }
    wk.weekProb = probs.reduce((a, b) => a * b, 1);
    if (wk.week >= currentWeek) survival = (survival ?? 1) * wk.weekProb;
    wk.recommended.sort((a, b) => b.prob - a.prob);
  }

  return { season, currentWeek, homeOnly, weeks, usedTeams: [...used].sort(), survivalProb: survival, infeasible };
}
