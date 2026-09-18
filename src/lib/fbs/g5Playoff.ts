// src/lib/fbs/g5Playoff.ts

/**
 * Group of Five playoff odds.
 *
 * A G5 team reaches the 12-team playoff as one of the five highest-ranked
 * conference champions; the four Power 4 champions take four of those
 * spots, so in practice ONE G5 champion gets in — the one the committee
 * ranks highest. At-large bids for G5 teams round to zero and are ignored.
 *
 *   P(playoff) = P(wins its conference) × P(best-ranked G5 champion | won)
 *
 * Both pieces come out of one season simulation from the Ledger ratings:
 * every game involving a G5 team is sampled (rating gap + venue → win
 * probability, σ 13.5 like futures), each G5 race is settled (best
 * conference record, head-to-head for two-way ties, title game sampled on
 * a neutral field), and the champions are ranked by a committee score
 *
 *   score = rating − lossPenalty × losses
 *
 * so wins and losses matter, but only up to a point set by the penalty.
 * The top scorer takes the bid; its share of simulations is its
 * probability. Deterministic RNG, so two loads agree.
 */

import { FBS_DEFAULT_HFA } from './constants';
import { FbsTeamRating } from './types';
import { FcsTeamRating } from '@/lib/fcs/types';
import { FCS_TO_FBS_OFFSET_FALLBACK } from '@/lib/crossDivision';
import { fairAmerican, FUTURES_SIGMA, homeWinProb, normalCdf, ScheduleGame } from './futures';
import { DEFAULT_TIMING_WINDOW, makeTiming, Timing, TimingGame } from './timing';

export const G5_CONFERENCES = ['American', 'CUSA', 'MAC', 'Mountain West', 'Pac-12', 'Sun Belt'];
export const DEFAULT_LOSS_PENALTY = 4;
export const G5_SIMS = 5000;

export interface G5Team {
  teamName: string;
  espnName: string | null;
  espnId: string | null;
  conference: string;
  rating: number;
  wins: number;            // completed games
  losses: number;
  projWins: number;        // expected regular season (sampled, all rated games)
  projLosses: number;
  unratedGames: number;
  pChamp: number;          // wins the conference (title game included)
  pBestIfChamp: number;    // best-ranked G5 champion, given it won
  pPlayoff: number;
  odds: number | null;     // fair American on pPlayoff
  avgChampLosses: number | null; // losses in the seasons it wins the league
  timing: Timing | null;         // next-N-games market-timing signal
}

export interface G5Conference {
  name: string;
  pBid: number;            // this league's champion takes the G5 spot
  teams: G5Team[];         // by pPlayoff desc
}

export interface G5Result {
  season: number;
  sims: number;
  sigma: number;
  lossPenalty: number;
  window: number;
  conferences: G5Conference[];  // by pBid desc
  teams: G5Team[];              // every G5 team by pPlayoff desc
  gamesSimulated: number;
}

interface SimGame {
  homeIdx: number;   // index into g5 teams, -1 if not a G5 team
  awayIdx: number;
  pHome: number;
  completed: boolean;
  homeWon: boolean;
  confGame: boolean; // both sides in the same G5 conference
  date: string;
  homeName: string;
  awayName: string;
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

export function buildG5Playoff(
  season: number,
  schedule: ScheduleGame[],
  fbsRatings: Map<string, FbsTeamRating>,
  fcsRatings: Map<string, FcsTeamRating>,
  hfaDefault: number = FBS_DEFAULT_HFA,
  lossPenalty: number = DEFAULT_LOSS_PENALTY,
  sims: number = G5_SIMS,
  sigma: number = FUTURES_SIGMA,
  window: number = DEFAULT_TIMING_WINDOW
): G5Result {
  const fbsById = new Map<string, FbsTeamRating>();
  for (const r of fbsRatings.values()) if (r.espnId) fbsById.set(r.espnId, r);
  const fcsById = new Map<string, FcsTeamRating>();
  for (const r of fcsRatings.values()) if (r.espnId) fcsById.set(r.espnId, r);

  // G5 teams, indexed
  const g5: FbsTeamRating[] = [...fbsRatings.values()]
    .filter((r) => r.espnId && r.conference && G5_CONFERENCES.includes(r.conference))
    .sort((a, b) => a.teamName.localeCompare(b.teamName));
  const idxOf = new Map<string, number>(g5.map((t, i) => [t.espnId as string, i]));
  const n = g5.length;
  const confOf = g5.map((t) => t.conference as string);
  const confs = G5_CONFERENCES.filter((c) => confOf.includes(c));
  const membersOf = new Map<string, number[]>(confs.map((c) => [c, g5.map((t, i) => (t.conference === c ? i : -1)).filter((i) => i >= 0)]));

  const ratingOnScale = (id: string): { rating: number; hfa: number | null } | null => {
    const f = fbsById.get(id);
    if (f) return { rating: f.rating, hfa: f.hfa };
    const c = fcsById.get(id);
    if (c) return { rating: c.rating + FCS_TO_FBS_OFFSET_FALLBACK, hfa: c.hfa };
    return null;
  };

  // Every game with a G5 team on either side, sampled once per sim so a
  // conference game's result is shared by both teams.
  const games: SimGame[] = [];
  const baseW = new Array<number>(n).fill(0);
  const baseL = new Array<number>(n).fill(0);
  const baseCW = new Array<number>(n).fill(0);
  const baseCL = new Array<number>(n).fill(0);
  const unrated = new Array<number>(n).fill(0);
  for (const g of schedule) {
    const hi = idxOf.get(g.homeId) ?? -1;
    const ai = idxOf.get(g.awayId) ?? -1;
    if (hi < 0 && ai < 0) continue;
    const home = ratingOnScale(g.homeId);
    const away = ratingOnScale(g.awayId);
    const completed = g.completed && g.homeScore !== null && g.awayScore !== null;
    const confGame = hi >= 0 && ai >= 0 && confOf[hi] === confOf[ai];
    if (!completed && (!home || !away)) {
      if (hi >= 0) unrated[hi]++;
      if (ai >= 0) unrated[ai]++;
      continue;
    }
    const homeWon = completed ? (g.homeScore as number) > (g.awayScore as number) : false;
    if (completed) {
      if (hi >= 0) { if (homeWon) baseW[hi]++; else baseL[hi]++; if (confGame) { if (homeWon) baseCW[hi]++; else baseCL[hi]++; } }
      if (ai >= 0) { if (!homeWon) baseW[ai]++; else baseL[ai]++; if (confGame) { if (!homeWon) baseCW[ai]++; else baseCL[ai]++; } }
      // Completed conference games still feed head-to-head below
      if (!confGame) continue;
    }
    const hfa = g.neutral ? 0 : (home!.hfa ?? hfaDefault);
    const pHome = completed ? (homeWon ? 1 : 0) : homeWinProb(-((home!.rating - away!.rating) + hfa), sigma);
    games.push({
      homeIdx: hi, awayIdx: ai, pHome, completed, homeWon, confGame,
      date: g.date,
      homeName: fbsById.get(g.homeId)?.teamName ?? fcsById.get(g.homeId)?.teamName ?? g.homeName,
      awayName: fbsById.get(g.awayId)?.teamName ?? fcsById.get(g.awayId)?.teamName ?? g.awayName,
      neutral: g.neutral,
    });
  }

  // Each team's next `window` unplayed rated games (indices into `games`)
  const order = games.map((g, k) => k).filter((k) => !games[k].completed).sort((a, b) => games[a].date.localeCompare(games[b].date));
  const nextOf: number[][] = Array.from({ length: n }, () => []);
  for (const k of order) {
    const g = games[k];
    if (g.homeIdx >= 0 && nextOf[g.homeIdx].length < window) nextOf[g.homeIdx].push(k);
    if (g.awayIdx >= 0 && nextOf[g.awayIdx].length < window) nextOf[g.awayIdx].push(k);
  }
  const timingGames = (i: number): TimingGame[] =>
    nextOf[i].map((k) => {
      const g = games[k];
      const home = g.homeIdx === i;
      return { opponent: home ? g.awayName : g.homeName, home, neutral: g.neutral, pWin: home ? g.pHome : 1 - g.pHome, date: g.date };
    });

  const ratingOf = g5.map((t) => t.rating);
  const pNeutral = (i: number, j: number) => normalCdf((ratingOf[i] - ratingOf[j]) / sigma);
  const rand = rng(season * 7919 + n * 131 + games.length + Math.round(lossPenalty * 1000));
  const pick = (arr: number[]) => arr[Math.floor(rand() * arr.length)];

  const wins = new Array<number>(n).fill(0);
  const losses = new Array<number>(n).fill(0);
  const cw = new Array<number>(n).fill(0);
  const cl = new Array<number>(n).fill(0);
  const champCount = new Array<number>(n).fill(0);
  const bidCount = new Array<number>(n).fill(0);
  const champLossSum = new Array<number>(n).fill(0);
  const winSum = new Array<number>(n).fill(0);
  const lossSum = new Array<number>(n).fill(0);
  const confBid = new Map<string, number>(confs.map((c) => [c, 0]));
  const h2h = new Map<string, number>();
  const outcome = new Array<boolean>(games.length).fill(false); // homeWon per game, this sim
  const sweepCount = new Array<number>(n).fill(0);
  const bidIfSweep = new Array<number>(n).fill(0);
  const bidIfNotSweep = new Array<number>(n).fill(0);

  for (let s = 0; s < sims; s++) {
    for (let i = 0; i < n; i++) { wins[i] = baseW[i]; losses[i] = baseL[i]; cw[i] = baseCW[i]; cl[i] = baseCL[i]; }
    h2h.clear();
    for (let k = 0; k < games.length; k++) {
      const g = games[k];
      const homeWon = g.completed ? g.homeWon : rand() < g.pHome;
      outcome[k] = homeWon;
      if (!g.completed) {
        if (g.homeIdx >= 0) { if (homeWon) wins[g.homeIdx]++; else losses[g.homeIdx]++; if (g.confGame) { if (homeWon) cw[g.homeIdx]++; else cl[g.homeIdx]++; } }
        if (g.awayIdx >= 0) { if (!homeWon) wins[g.awayIdx]++; else losses[g.awayIdx]++; if (g.confGame) { if (!homeWon) cw[g.awayIdx]++; else cl[g.awayIdx]++; } }
      }
      if (g.confGame) {
        const lo = Math.min(g.homeIdx, g.awayIdx);
        const hi = Math.max(g.homeIdx, g.awayIdx);
        h2h.set(`${lo},${hi}`, homeWon ? g.homeIdx : g.awayIdx);
      }
    }
    for (let i = 0; i < n; i++) { winSum[i] += wins[i]; lossSum[i] += losses[i]; }

    // Settle each G5 conference: top two by conference record, title game
    let bestScore = -Infinity;
    let bestIdx = -1;
    for (const c of confs) {
      const members = membersOf.get(c)!;
      let top = -1;
      const leaders: number[] = [];
      for (const i of members) {
        const w = cw[i] - cl[i]; // record margin; ties then by wins
        if (w > top) { top = w; leaders.length = 0; leaders.push(i); }
        else if (w === top) leaders.push(i);
      }
      if (leaders.length === 0) continue;
      let a: number;
      let b: number;
      if (leaders.length >= 2) {
        if (leaders.length === 2) {
          const [x, y] = leaders;
          const w = h2h.get(`${Math.min(x, y)},${Math.max(x, y)}`);
          a = w !== undefined ? w : pick(leaders);
          b = a === x ? y : x;
        } else {
          a = pick(leaders);
          b = pick(leaders.filter((i) => i !== a));
        }
      } else {
        a = leaders[0];
        let second = -Infinity;
        const runners: number[] = [];
        for (const i of members) {
          if (i === a) continue;
          const w = cw[i] - cl[i];
          if (w > second) { second = w; runners.length = 0; runners.push(i); }
          else if (w === second) runners.push(i);
        }
        if (runners.length === 2) {
          const [x, y] = runners;
          const w = h2h.get(`${Math.min(x, y)},${Math.max(x, y)}`);
          b = w !== undefined ? w : pick(runners);
        } else {
          b = runners.length ? pick(runners) : -1;
        }
      }
      let champ = a;
      if (b >= 0) {
        const aWins = rand() < pNeutral(a, b);
        champ = aWins ? a : b;
        // Title game counts on the record the committee sees
        if (aWins) { wins[a]++; losses[b]++; } else { wins[b]++; losses[a]++; }
      }
      champCount[champ]++;
      champLossSum[champ] += losses[champ];
      const score = ratingOf[champ] - lossPenalty * losses[champ];
      if (score > bestScore) { bestScore = score; bestIdx = champ; }
    }
    if (bestIdx >= 0) {
      bidCount[bestIdx]++;
      confBid.set(confOf[bestIdx], (confBid.get(confOf[bestIdx]) ?? 0) + 1);
    }
    // Timing: did each team sweep its next games this run, and did it get the bid?
    for (let i = 0; i < n; i++) {
      const nx = nextOf[i];
      if (nx.length < window) continue;
      let swept = true;
      for (const k of nx) if (outcome[k] !== (games[k].homeIdx === i)) { swept = false; break; }
      if (swept) { sweepCount[i]++; if (bestIdx === i) bidIfSweep[i]++; }
      else if (bestIdx === i) bidIfNotSweep[i]++;
    }
  }

  const teams: G5Team[] = g5.map((t, i) => {
    const pChamp = champCount[i] / sims;
    const pPlayoff = bidCount[i] / sims;
    return {
      teamName: t.teamName,
      espnName: t.espnName,
      espnId: t.espnId,
      conference: t.conference as string,
      rating: t.rating,
      wins: baseW[i],
      losses: baseL[i],
      projWins: Math.round((winSum[i] / sims) * 10) / 10,
      projLosses: Math.round((lossSum[i] / sims) * 10) / 10,
      unratedGames: unrated[i],
      pChamp: Math.round(pChamp * 10000) / 10000,
      pBestIfChamp: champCount[i] ? Math.round((bidCount[i] / champCount[i]) * 10000) / 10000 : 0,
      pPlayoff: Math.round(pPlayoff * 10000) / 10000,
      odds: fairAmerican(pPlayoff),
      avgChampLosses: champCount[i] ? Math.round((champLossSum[i] / champCount[i]) * 10) / 10 : null,
      timing: makeTiming(window, timingGames(i), sweepCount[i], bidIfSweep[i], bidIfNotSweep[i], sims, pPlayoff),
    };
  });
  teams.sort((a, b) => b.pPlayoff - a.pPlayoff || b.pChamp - a.pChamp || b.rating - a.rating);

  const conferences: G5Conference[] = confs
    .map((c) => ({
      name: c,
      pBid: Math.round(((confBid.get(c) ?? 0) / sims) * 10000) / 10000,
      teams: teams.filter((t) => t.conference === c),
    }))
    .sort((a, b) => b.pBid - a.pBid);

  return { season, sims, sigma, lossPenalty, window, conferences, teams, gamesSimulated: games.length };
}
