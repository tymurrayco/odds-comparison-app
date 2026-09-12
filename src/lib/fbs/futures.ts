// src/lib/fbs/futures.ts

/**
 * FBS conference futures from the Ledger ratings.
 *
 * Every remaining game gets a win probability from the projected spread
 * (rating gap + home edge) through a normal CDF with the college margin
 * spread (σ ≈ 13.5 points — same conversion idea as the NCAAB bracket).
 * Completed games count as played. Each conference race is then simulated:
 * remaining conference games are drawn game by game, the best conference
 * record wins the regular-season title, a two-way tie goes to the
 * head-to-head winner when they met, any other tie splits the title equally.
 * The share of simulations a team wins is its title probability; the
 * fair (no-vig) American price comes straight from that.
 *
 * FCS opponents are bridged onto the FBS scale with the cross-division
 * fallback offset so non-conference games still contribute to the
 * projected overall record.
 */

import { ESPN_FBS_SCOREBOARD_URL, FBS_DEFAULT_HFA } from './constants';
import { hfaForGame } from './engine';
import { FbsTeamRating } from './types';
import { FcsTeamRating } from '@/lib/fcs/types';
import { FCS_TO_FBS_OFFSET_FALLBACK } from '@/lib/crossDivision';

export const FUTURES_SIGMA = 13.5;
export const FUTURES_SIMS = 5000;
const REGULAR_SEASON_WEEKS = 15; // 14 = conference championship week, 15 = Army-Navy

export interface ScheduleGame {
  id: string;
  date: string;
  week: number | null;
  homeId: string;
  awayId: string;
  homeName: string;
  awayName: string;
  neutral: boolean;
  conferenceGame: boolean;
  completed: boolean;
  homeScore: number | null;
  awayScore: number | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

let scheduleCache: { season: number; at: number; games: ScheduleGame[] } | null = null;
const SCHEDULE_TTL_MS = 30 * 60 * 1000;

export async function fetchFbsSeasonSchedule(season: number): Promise<ScheduleGame[]> {
  if (scheduleCache && scheduleCache.season === season && Date.now() - scheduleCache.at < SCHEDULE_TTL_MS) {
    return scheduleCache.games;
  }
  const byId = new Map<string, ScheduleGame>();
  const weeks = Array.from({ length: REGULAR_SEASON_WEEKS }, (_, i) => i + 1);
  const pages = await Promise.all(
    weeks.map(async (week) => {
      const url = `${ESPN_FBS_SCOREBOARD_URL}?dates=${season}&seasontype=2&week=${week}&groups=80&limit=400`;
      const res = await fetch(url);
      if (!res.ok) return null;
      return res.json();
    })
  );
  for (const json of pages) {
    for (const event of json?.events ?? []) {
      const comp = event.competitions?.[0];
      if (!comp) continue;
      const home = comp.competitors?.find((c: any) => c.homeAway === 'home');
      const away = comp.competitors?.find((c: any) => c.homeAway === 'away');
      if (!home?.team?.id || !away?.team?.id) continue;
      const homeName = home.team.displayName ?? '';
      const awayName = away.team.displayName ?? '';
      if (/^TBD/i.test(homeName) || /^TBD/i.test(awayName)) continue; // championship placeholders
      // Week 14 is conference championship week: those games decide a
      // different title and would double-count as conference games once
      // ESPN names the participants. Army-Navy (week 15) stays.
      if (event.week?.number === 14) continue;
      const completed = comp.status?.type?.completed === true;
      byId.set(String(event.id), {
        id: String(event.id),
        date: comp.date ?? event.date,
        week: event.week?.number ?? null,
        homeId: String(home.team.id),
        awayId: String(away.team.id),
        homeName,
        awayName,
        neutral: comp.neutralSite === true || comp.venue?.neutral === true,
        conferenceGame: comp.conferenceCompetition === true,
        completed,
        homeScore: completed ? Number(home.score) : null,
        awayScore: completed ? Number(away.score) : null,
      });
    }
  }
  const games = [...byId.values()].sort((a, b) => a.date.localeCompare(b.date));
  scheduleCache = { season, at: Date.now(), games };
  return games;
}

// ---------- probability helpers ----------

/** Standard normal CDF (Abramowitz–Stegun 7.1.26, |err| < 1.5e-7). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

/** P(home wins) from a home-perspective spread (negative = home favored). */
export const homeWinProb = (homeSpread: number, sigma = FUTURES_SIGMA): number =>
  normalCdf(-homeSpread / sigma);

/** Fair American price from a probability; null when it isn't worth quoting. */
export function fairAmerican(p: number): number | null {
  if (!(p > 0.0005)) return null;
  if (p >= 0.9995) return -50000;
  const raw = p >= 0.5 ? (-100 * p) / (1 - p) : (100 * (1 - p)) / p;
  const rounded = Math.round(raw / 5) * 5;
  return Math.max(-50000, Math.min(50000, rounded === 0 ? (p >= 0.5 ? -100 : 100) : rounded));
}

// ---------- futures ----------

export interface FuturesTeam {
  teamName: string;
  espnName: string | null;
  espnId: string | null;
  rating: number;
  confWins: number;
  confLosses: number;
  confRemaining: number;
  projConfWins: number;   // expected, this season
  projConfLosses: number;
  wins: number;           // overall, completed
  losses: number;
  projWins: number;       // expected overall (FBS opponents from the ratings, FCS bridged)
  projLosses: number;
  unratedGames: number;   // games vs opponents outside both ratings tables (excluded)
  titleProb: number;
  odds: number | null;    // fair American
  top2Prob: number;       // finishes in the conference's top two (title-game berth)
  ccgProb: number;        // wins the conference championship game (berth × neutral-field win)
  ccgOdds: number | null;
}

export interface FuturesConference {
  name: string;
  teams: FuturesTeam[];   // best title odds first
  gamesPlayed: number;    // conference games completed
  gamesRemaining: number;
  // Likeliest title game: gold = projected champion, silver = the next most
  // likely top-two finisher; spread from gold's side on a neutral field.
  championship: {
    gold: string;
    silver: string;
    goldTop2Prob: number;
    silverTop2Prob: number;
    spread: number;       // negative = gold favored
  } | null;
}

export interface FuturesResult {
  season: number;
  sims: number;
  sigma: number;
  conferences: FuturesConference[];
  gamesInSchedule: number;
}

interface GameEval {
  homeIdx: number;
  awayIdx: number;
  pHome: number;
  completed: boolean;
  homeWon: boolean;
}

// Deterministic PRNG (mulberry32) so two loads in the same minute agree
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildFutures(
  season: number,
  schedule: ScheduleGame[],
  fbsRatings: Map<string, FbsTeamRating>,
  fcsRatings: Map<string, FcsTeamRating>,
  hfaDefault: number = FBS_DEFAULT_HFA,
  sims: number = FUTURES_SIMS,
  sigma: number = FUTURES_SIGMA
): FuturesResult {
  const fbsById = new Map<string, FbsTeamRating>();
  for (const r of fbsRatings.values()) if (r.espnId) fbsById.set(r.espnId, r);
  const fcsById = new Map<string, FcsTeamRating>();
  for (const r of fcsRatings.values()) if (r.espnId) fcsById.set(r.espnId, r);

  // Per-team overall tallies (completed + expected)
  const tally = new Map<string, { w: number; l: number; pw: number; pl: number; unrated: number }>();
  const t = (id: string) => {
    let x = tally.get(id);
    if (!x) {
      x = { w: 0, l: 0, pw: 0, pl: 0, unrated: 0 };
      tally.set(id, x);
    }
    return x;
  };

  const ratingOnScale = (id: string): { rating: number; hfa: number | null } | null => {
    const f = fbsById.get(id);
    if (f) return { rating: f.rating, hfa: f.hfa };
    const c = fcsById.get(id);
    if (c) return { rating: c.rating + FCS_TO_FBS_OFFSET_FALLBACK, hfa: c.hfa };
    return null;
  };

  // Conference games grouped by conference (both teams FBS-rated, same conference)
  const confGames = new Map<string, GameEval[]>();
  const confTeams = new Map<string, FbsTeamRating[]>();
  for (const r of fbsRatings.values()) {
    const c = r.conference ?? 'Independent';
    if (/independent/i.test(c)) continue;
    if (!confTeams.has(c)) confTeams.set(c, []);
    confTeams.get(c)!.push(r);
  }
  const idxIn = new Map<string, Map<string, number>>();
  for (const [c, teams] of confTeams) idxIn.set(c, new Map(teams.map((x, i) => [x.espnId as string, i])));

  for (const g of schedule) {
    const home = ratingOnScale(g.homeId);
    const away = ratingOnScale(g.awayId);
    const homeFbs = fbsById.get(g.homeId);
    const awayFbs = fbsById.get(g.awayId);
    // Overall tallies for any FBS team in the game
    const tallyFor = (id: string, isHome: boolean) => {
      const fbs = fbsById.get(id);
      if (!fbs) return;
      const x = t(id);
      if (g.completed && g.homeScore !== null && g.awayScore !== null) {
        const won = isHome ? g.homeScore > g.awayScore : g.awayScore > g.homeScore;
        if (won) x.w++; else x.l++;
      } else if (home && away) {
        const hfa = g.neutral ? 0 : (home.hfa ?? hfaDefault);
        const homeSpread = -((home.rating - away.rating) + hfa);
        const p = homeWinProb(homeSpread, sigma);
        x.pw += isHome ? p : 1 - p;
        x.pl += isHome ? 1 - p : p;
      } else {
        x.unrated++;
      }
    };
    tallyFor(g.homeId, true);
    tallyFor(g.awayId, false);

    // Conference race input
    if (!g.conferenceGame || !homeFbs || !awayFbs) continue;
    const c = homeFbs.conference ?? '';
    if (c !== (awayFbs.conference ?? '') || !confGames.has(c) && !confTeams.has(c)) continue;
    const idx = idxIn.get(c);
    if (!idx) continue;
    const hi = idx.get(g.homeId);
    const ai = idx.get(g.awayId);
    if (hi === undefined || ai === undefined) continue;
    const hfa = hfaForGame(homeFbs, g.neutral, hfaDefault);
    const homeSpread = -((homeFbs.rating - awayFbs.rating) + hfa);
    if (!confGames.has(c)) confGames.set(c, []);
    confGames.get(c)!.push({
      homeIdx: hi,
      awayIdx: ai,
      pHome: homeWinProb(homeSpread, sigma),
      completed: g.completed && g.homeScore !== null && g.awayScore !== null,
      homeWon: g.completed && g.homeScore !== null && g.awayScore !== null ? g.homeScore > g.awayScore : false,
    });
  }

  const conferences: FuturesConference[] = [];
  for (const [name, teams] of confTeams) {
    const games = confGames.get(name) ?? [];
    const n = teams.length;
    const baseWins = new Array<number>(n).fill(0);
    const baseLosses = new Array<number>(n).fill(0);
    const remaining: GameEval[] = [];
    const expConfWins = new Array<number>(n).fill(0);
    const expConfLosses = new Array<number>(n).fill(0);
    const remainingCount = new Array<number>(n).fill(0);
    for (const g of games) {
      if (g.completed) {
        if (g.homeWon) { baseWins[g.homeIdx]++; baseLosses[g.awayIdx]++; }
        else { baseWins[g.awayIdx]++; baseLosses[g.homeIdx]++; }
      } else {
        remaining.push(g);
        remainingCount[g.homeIdx]++;
        remainingCount[g.awayIdx]++;
        expConfWins[g.homeIdx] += g.pHome; expConfLosses[g.homeIdx] += 1 - g.pHome;
        expConfWins[g.awayIdx] += 1 - g.pHome; expConfLosses[g.awayIdx] += g.pHome;
      }
    }

    // Head-to-head lookup for two-way ties: key "i,j" -> winner index per sim
    const titles = new Array<number>(n).fill(0);
    const top2 = new Array<number>(n).fill(0); // title-game berths (2 per sim)
    const ccg = new Array<number>(n).fill(0);  // title-game wins (expected, 1 per sim)
    // Neutral-field win probability between two conference teams
    const ratingOf = teams.map((x) => x.rating);
    const pNeutral = (i: number, j: number) => normalCdf((ratingOf[i] - ratingOf[j]) / sigma);
    const pick = (arr: number[]) => arr[Math.floor(rand() * arr.length)];
    const rand = rng(season * 7919 + name.length * 131 + games.length);
    const wins = new Array<number>(n);
    const h2h = new Map<string, number>(); // "lo,hi" -> winner idx (this sim)
    for (let s = 0; s < sims; s++) {
      for (let i = 0; i < n; i++) wins[i] = baseWins[i];
      h2h.clear();
      for (const g of games) {
        let homeWon: boolean;
        if (g.completed) homeWon = g.homeWon;
        else homeWon = rand() < g.pHome;
        const w = homeWon ? g.homeIdx : g.awayIdx;
        wins[w]++;
        const lo = Math.min(g.homeIdx, g.awayIdx);
        const hi = Math.max(g.homeIdx, g.awayIdx);
        h2h.set(`${lo},${hi}`, w);
      }
      let best = -1;
      const leaders: number[] = [];
      for (let i = 0; i < n; i++) {
        if (wins[i] > best) { best = wins[i]; leaders.length = 0; leaders.push(i); }
        else if (wins[i] === best) leaders.push(i);
      }
      if (leaders.length === 1) {
        titles[leaders[0]] += 1;
      } else if (leaders.length === 2) {
        const [a, b] = leaders;
        const winner = h2h.get(`${Math.min(a, b)},${Math.max(a, b)}`);
        if (winner !== undefined) titles[winner] += 1;
        else { titles[a] += 0.5; titles[b] += 0.5; }
      } else {
        for (const i of leaders) titles[i] += 1 / leaders.length;
      }
      // Top-two berths: a tie at the top shares both spots; a lone leader
      // takes one and the runner-up group (head-to-head for a two-way tie)
      // shares the other.
      // The title game itself needs an actual pair, so ties are drawn at
      // random (head-to-head first for two-way ties); the game is then
      // credited as an expectation rather than sampled.
      let pairA: number;
      let pairB: number;
      if (leaders.length >= 2) {
        for (const i of leaders) top2[i] += 2 / leaders.length;
        pairA = pick(leaders);
        pairB = pick(leaders.filter((i) => i !== pairA));
      } else {
        top2[leaders[0]] += 1;
        pairA = leaders[0];
        let second = -1;
        const runners: number[] = [];
        for (let i = 0; i < n; i++) {
          if (i === leaders[0]) continue;
          if (wins[i] > second) { second = wins[i]; runners.length = 0; runners.push(i); }
          else if (wins[i] === second) runners.push(i);
        }
        if (runners.length === 1) {
          top2[runners[0]] += 1;
          pairB = runners[0];
        } else if (runners.length === 2) {
          const [a, b] = runners;
          const winner = h2h.get(`${Math.min(a, b)},${Math.max(a, b)}`);
          if (winner !== undefined) { top2[winner] += 1; pairB = winner; }
          else { top2[a] += 0.5; top2[b] += 0.5; pairB = pick(runners); }
        } else {
          for (const i of runners) top2[i] += 1 / runners.length;
          pairB = runners.length ? pick(runners) : -1;
        }
      }
      if (pairB >= 0) {
        const p = pNeutral(pairA, pairB);
        ccg[pairA] += p;
        ccg[pairB] += 1 - p;
      }
    }

    const rows: FuturesTeam[] = teams.map((r, i) => {
      const o = tally.get(r.espnId as string) ?? { w: 0, l: 0, pw: 0, pl: 0, unrated: 0 };
      const p = titles[i] / sims;
      return {
        teamName: r.teamName,
        espnName: r.espnName,
        espnId: r.espnId,
        rating: r.rating,
        confWins: baseWins[i],
        confLosses: baseLosses[i],
        confRemaining: remainingCount[i],
        projConfWins: Math.round((baseWins[i] + expConfWins[i]) * 10) / 10,
        projConfLosses: Math.round((baseLosses[i] + expConfLosses[i]) * 10) / 10,
        wins: o.w,
        losses: o.l,
        projWins: Math.round((o.w + o.pw) * 10) / 10,
        projLosses: Math.round((o.l + o.pl) * 10) / 10,
        unratedGames: o.unrated,
        titleProb: Math.round(p * 10000) / 10000,
        odds: fairAmerican(p),
        top2Prob: Math.round((top2[i] / sims) * 10000) / 10000,
        ccgProb: Math.round((ccg[i] / sims) * 10000) / 10000,
        ccgOdds: fairAmerican(ccg[i] / sims),
      };
    }).sort((a, b) => b.titleProb - a.titleProb || b.rating - a.rating);

    let championship: FuturesConference['championship'] = null;
    if (rows.length >= 2) {
      const gold = rows[0];
      const silver = rows.slice(1).sort((a, b) => b.top2Prob - a.top2Prob || b.titleProb - a.titleProb)[0];
      championship = {
        gold: gold.teamName,
        silver: silver.teamName,
        goldTop2Prob: gold.top2Prob,
        silverTop2Prob: silver.top2Prob,
        spread: Math.round(-(gold.rating - silver.rating) * 2) / 2,
      };
    }

    conferences.push({
      name,
      teams: rows,
      gamesPlayed: games.length - remaining.length,
      gamesRemaining: remaining.length,
      championship,
    });
  }
  conferences.sort((a, b) => a.name.localeCompare(b.name));
  return { season, sims, sigma, conferences, gamesInSchedule: schedule.length };
}
