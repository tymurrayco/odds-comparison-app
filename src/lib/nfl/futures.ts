// src/lib/nfl/futures.ts

/**
 * NFL futures from the Ledger ratings: division titles, playoff berths,
 * No. 1 seeds, conference titles and the Super Bowl.
 *
 * Each simulated season samples every unplayed regular-season game from the
 * projected spread (rating gap + home edge, σ 13 like the survivor
 * planner). Divisions are settled on record with head-to-head, division
 * record and conference record as tiebreakers (rating as the last resort),
 * the seven-team bracket is seeded (four division winners, three wild
 * cards), and the playoffs are played with the higher seed at home and a
 * neutral Super Bowl. Shares of simulations are the probabilities;
 * deterministic RNG so two loads agree.
 *
 * Market-timing counters (next N games) run against the division title.
 */

import { NFL_DEFAULT_HFA } from './constants';
import { NflTeamRating } from './types';
import { SURVIVOR_SIGMA } from './survivor';
import { SosInputGame } from '@/lib/sos';
import { fairAmerican, normalCdf } from '@/lib/fbs/futures';
import { DEFAULT_TIMING_WINDOW, makeTiming, Timing, TimingGame } from '@/lib/fbs/timing';

export const NFL_FUTURES_SIMS = 5000;

export interface NflFuturesTeam {
  teamName: string;
  espnAbbr: string | null;
  espnId: string | null;
  division: string;      // "AFC East"
  conference: string;    // "AFC"
  rating: number;
  wins: number;          // completed
  losses: number;
  ties: number;
  projWins: number;      // expected, full season
  projLosses: number;
  pDiv: number;
  pPlayoff: number;
  pSeed1: number;
  pConf: number;
  pSb: number;
  divOdds: number | null;
  confOdds: number | null;
  sbOdds: number | null;
  timing: Timing | null; // against the division title
}

export interface NflDivision { name: string; conference: string; teams: NflFuturesTeam[] }
export interface NflConference { name: string; teams: NflFuturesTeam[] }

export interface NflFuturesResult {
  season: number;
  sims: number;
  sigma: number;
  window: number;
  divisions: NflDivision[];     // AFC then NFC, East/North/South/West
  conferences: NflConference[]; // by pConf desc within
  teams: NflFuturesTeam[];      // by pSb desc
  gamesSimulated: number;
}

interface SimGame {
  homeIdx: number;
  awayIdx: number;
  pHome: number;
  completed: boolean;
  homeWon: boolean;
  tie: boolean;
  date: string;
  neutral: boolean;
}

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

const DIV_ORDER = ['AFC East', 'AFC North', 'AFC South', 'AFC West', 'NFC East', 'NFC North', 'NFC South', 'NFC West'];

export function buildNflFutures(
  season: number,
  schedule: SosInputGame[],
  ratings: Map<string, NflTeamRating>,
  hfaDefault: number = NFL_DEFAULT_HFA,
  sims: number = NFL_FUTURES_SIMS,
  sigma: number = SURVIVOR_SIGMA,
  window: number = DEFAULT_TIMING_WINDOW
): NflFuturesResult {
  const teams = [...ratings.values()]
    .filter((r) => r.conference && DIV_ORDER.includes(r.conference))
    .sort((a, b) => a.teamName.localeCompare(b.teamName));
  const n = teams.length;
  const idxOf = new Map<string, number>(teams.map((t, i) => [t.teamName, i]));
  const divOf = teams.map((t) => t.conference as string);
  const confOf = divOf.map((d) => d.slice(0, 3));
  const ratingOf = teams.map((t) => t.rating);
  const hfaOf = teams.map((t) => t.hfa ?? hfaDefault);
  const divisions = DIV_ORDER.filter((d) => divOf.includes(d));
  const membersOf = new Map<string, number[]>(divisions.map((d) => [d, teams.map((t, i) => (divOf[i] === d ? i : -1)).filter((i) => i >= 0)]));
  const confs = ['AFC', 'NFC'].filter((c) => confOf.includes(c));

  // Regular-season games between rated teams
  const games: SimGame[] = [];
  const baseW = new Array<number>(n).fill(0);
  const baseL = new Array<number>(n).fill(0);
  const baseT = new Array<number>(n).fill(0);
  for (const g of [...schedule].sort((a, b) => a.date.localeCompare(b.date))) {
    if (g.week !== null && g.week > 18) continue;
    const hi = idxOf.get(g.homeKey);
    const ai = idxOf.get(g.awayKey);
    if (hi === undefined || ai === undefined) continue;
    const completed = g.completed && g.homeScore !== null && g.awayScore !== null;
    const tie = completed && g.homeScore === g.awayScore;
    const homeWon = completed && !tie && (g.homeScore as number) > (g.awayScore as number);
    if (completed) {
      if (tie) { baseT[hi]++; baseT[ai]++; }
      else if (homeWon) { baseW[hi]++; baseL[ai]++; }
      else { baseW[ai]++; baseL[hi]++; }
    }
    const hfa = g.neutral ? 0 : hfaOf[hi];
    const pHome = completed ? (homeWon ? 1 : 0) : normalCdf(((ratingOf[hi] - ratingOf[ai]) + hfa) / sigma);
    games.push({ homeIdx: hi, awayIdx: ai, pHome, completed, homeWon, tie, date: g.date, neutral: g.neutral });
  }

  // Timing window: each team's next `window` unplayed games
  const nextOf: number[][] = Array.from({ length: n }, () => []);
  games.forEach((g, k) => {
    if (g.completed) return;
    if (nextOf[g.homeIdx].length < window) nextOf[g.homeIdx].push(k);
    if (nextOf[g.awayIdx].length < window) nextOf[g.awayIdx].push(k);
  });
  const timingGames = (i: number): TimingGame[] =>
    nextOf[i].map((k) => {
      const g = games[k];
      const home = g.homeIdx === i;
      return { opponent: teams[home ? g.awayIdx : g.homeIdx].teamName, home, neutral: g.neutral, pWin: home ? g.pHome : 1 - g.pHome, date: g.date };
    });

  const rand = rng(season * 7919 + n * 131 + games.length + window * 17);
  const outcome = new Array<number>(games.length).fill(0); // 1 home, 0 away, 0.5 tie
  const winPts = new Array<number>(n).fill(0);
  const wins = new Array<number>(n).fill(0);
  const losses = new Array<number>(n).fill(0);
  const divW = new Array<number>(n).fill(0);
  const divL = new Array<number>(n).fill(0);
  const confW = new Array<number>(n).fill(0);
  const confL = new Array<number>(n).fill(0);
  const h2h = new Map<string, number>(); // "i,j" -> wins of i over j this sim

  const divCount = new Array<number>(n).fill(0);
  const playoffCount = new Array<number>(n).fill(0);
  const seed1Count = new Array<number>(n).fill(0);
  const confCount = new Array<number>(n).fill(0);
  const sbCount = new Array<number>(n).fill(0);
  const winSum = new Array<number>(n).fill(0);
  const lossSum = new Array<number>(n).fill(0);
  const sweepCount = new Array<number>(n).fill(0);
  const divIfSweep = new Array<number>(n).fill(0);
  const divIfNotSweep = new Array<number>(n).fill(0);

  const h2hNet = (a: number, b: number) => (h2h.get(`${a},${b}`) ?? 0) - (h2h.get(`${b},${a}`) ?? 0);
  const pctOf = (w: number, l: number) => (w + l > 0 ? w / (w + l) : 0);
  // NFL-style order: record, head-to-head, division record (same division),
  // conference record, then rating stands in for the deeper tiebreakers.
  const better = (a: number, b: number): number => {
    if (winPts[a] !== winPts[b]) return winPts[b] - winPts[a];
    const net = h2hNet(a, b);
    if (net !== 0) return -net;
    if (divOf[a] === divOf[b]) {
      const d = pctOf(divW[b], divL[b]) - pctOf(divW[a], divL[a]);
      if (Math.abs(d) > 1e-9) return d;
    }
    const c = pctOf(confW[b], confL[b]) - pctOf(confW[a], confL[a]);
    if (Math.abs(c) > 1e-9) return c;
    return ratingOf[b] - ratingOf[a];
  };
  const playoffGame = (home: number, away: number, neutral: boolean): number => {
    const hfa = neutral ? 0 : hfaOf[home];
    const p = normalCdf(((ratingOf[home] - ratingOf[away]) + hfa) / sigma);
    return rand() < p ? home : away;
  };

  for (let s = 0; s < sims; s++) {
    for (let i = 0; i < n; i++) {
      wins[i] = baseW[i]; losses[i] = baseL[i];
      winPts[i] = baseW[i] + 0.5 * baseT[i];
      divW[i] = 0; divL[i] = 0; confW[i] = 0; confL[i] = 0;
    }
    h2h.clear();
    for (let k = 0; k < games.length; k++) {
      const g = games[k];
      let res: number;
      if (g.completed) res = g.tie ? 0.5 : g.homeWon ? 1 : 0;
      else res = rand() < g.pHome ? 1 : 0;
      outcome[k] = res;
      const w = res === 1 ? g.homeIdx : res === 0 ? g.awayIdx : -1;
      const l = res === 1 ? g.awayIdx : res === 0 ? g.homeIdx : -1;
      if (!g.completed) {
        if (w >= 0) { wins[w]++; losses[l]++; winPts[w] += 1; }
      }
      if (w >= 0) {
        h2h.set(`${w},${l}`, (h2h.get(`${w},${l}`) ?? 0) + 1);
        if (divOf[w] === divOf[l]) { divW[w]++; divL[l]++; }
        if (confOf[w] === confOf[l]) { confW[w]++; confL[l]++; }
      }
    }
    for (let i = 0; i < n; i++) { winSum[i] += wins[i]; lossSum[i] += losses[i]; }

    const divWinner = new Map<string, number>();
    for (const d of divisions) {
      const m = [...membersOf.get(d)!].sort(better);
      divWinner.set(d, m[0]);
      divCount[m[0]]++;
    }
    const confChamp: Record<string, number> = {};
    for (const c of confs) {
      const winners = divisions.filter((d) => d.startsWith(c)).map((d) => divWinner.get(d)!).sort(better);
      const others = teams.map((_, i) => i).filter((i) => confOf[i] === c && !winners.includes(i)).sort(better);
      const seeds = [...winners, ...others.slice(0, 3)]; // 1..7
      seeds.forEach((i) => playoffCount[i]++);
      seed1Count[seeds[0]]++;
      // Wild card: 2v7, 3v6, 4v5
      const wc = [playoffGame(seeds[1], seeds[6], false), playoffGame(seeds[2], seeds[5], false), playoffGame(seeds[3], seeds[4], false)];
      const remain = [seeds[0], ...wc].sort((a, b) => seeds.indexOf(a) - seeds.indexOf(b));
      // Divisional: 1 seed hosts the lowest remaining; the other two meet
      const d1 = playoffGame(remain[0], remain[3], false);
      const d2 = playoffGame(remain[1], remain[2], false);
      const fin = [d1, d2].sort((a, b) => seeds.indexOf(a) - seeds.indexOf(b));
      const champ = playoffGame(fin[0], fin[1], false);
      confChamp[c] = champ;
      confCount[champ]++;
    }
    if (confChamp.AFC !== undefined && confChamp.NFC !== undefined) {
      const sb = playoffGame(confChamp.AFC, confChamp.NFC, true);
      sbCount[sb]++;
    }
    // Timing vs the division title
    for (let i = 0; i < n; i++) {
      const nx = nextOf[i];
      if (nx.length < window) continue;
      let swept = true;
      for (const k of nx) {
        const g = games[k];
        const won = outcome[k] === 1 ? g.homeIdx === i : outcome[k] === 0 ? g.awayIdx === i : false;
        if (!won) { swept = false; break; }
      }
      const wonDiv = divWinner.get(divOf[i]) === i ? 1 : 0;
      if (swept) { sweepCount[i]++; divIfSweep[i] += wonDiv; }
      else divIfNotSweep[i] += wonDiv;
    }
  }

  const rows: NflFuturesTeam[] = teams.map((t, i) => {
    const pDiv = divCount[i] / sims;
    const pConf = confCount[i] / sims;
    const pSb = sbCount[i] / sims;
    return {
      teamName: t.teamName,
      espnAbbr: t.espnAbbr,
      espnId: t.espnId,
      division: divOf[i],
      conference: confOf[i],
      rating: t.rating,
      wins: baseW[i],
      losses: baseL[i],
      ties: baseT[i],
      projWins: Math.round((winSum[i] / sims) * 10) / 10,
      projLosses: Math.round((lossSum[i] / sims) * 10) / 10,
      pDiv: Math.round(pDiv * 10000) / 10000,
      pPlayoff: Math.round((playoffCount[i] / sims) * 10000) / 10000,
      pSeed1: Math.round((seed1Count[i] / sims) * 10000) / 10000,
      pConf: Math.round(pConf * 10000) / 10000,
      pSb: Math.round(pSb * 10000) / 10000,
      divOdds: fairAmerican(pDiv),
      confOdds: fairAmerican(pConf),
      sbOdds: fairAmerican(pSb),
      timing: makeTiming(window, timingGames(i), sweepCount[i], divIfSweep[i], divIfNotSweep[i], sims, pDiv),
    };
  });

  const byDiv = divisions.map((d) => ({
    name: d,
    conference: d.slice(0, 3),
    teams: rows.filter((r) => r.division === d).sort((a, b) => b.pDiv - a.pDiv || b.rating - a.rating),
  }));
  const byConf = confs.map((c) => ({
    name: c,
    teams: rows.filter((r) => r.conference === c).sort((a, b) => b.pConf - a.pConf || b.pSb - a.pSb || b.rating - a.rating),
  }));
  const all = [...rows].sort((a, b) => b.pSb - a.pSb || b.pConf - a.pConf || b.rating - a.rating);

  return { season, sims, sigma, window, divisions: byDiv, conferences: byConf, teams: all, gamesSimulated: games.length };
}
