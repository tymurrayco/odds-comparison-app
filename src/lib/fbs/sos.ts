// src/lib/fbs/sos.ts

/**
 * FBS strength of schedule from the Ledger ratings.
 *
 * Every game on a team's slate is priced from the seat that team sits in:
 * the opponent's rating (FCS opponents bridged with the cross-division
 * fallback offset) plus the venue edge (the team's own HFA at home, minus
 * the opponent's HFA on the road, nothing on a neutral field). From that
 * spread the normal margin model (σ = 13.5, same as futures) gives the
 * chance a MEDIAN FBS team would win the game. Summed over the slate that
 * is the expected record of an average team playing that schedule — the
 * Massey / Torvik view, and the one that survives the game-count, venue and
 * linear-scale problems of summing raw opponent ratings.
 *
 * The library returns per-game numbers only; the panel aggregates them so
 * the same payload serves all-games / remaining / conference-only views.
 */

import { FBS_DEFAULT_HFA } from './constants';
import { FbsTeamRating } from './types';
import { FcsTeamRating } from '@/lib/fcs/types';
import { FCS_TO_FBS_OFFSET_FALLBACK } from '@/lib/crossDivision';
import { FUTURES_SIGMA, normalCdf, ScheduleGame } from './futures';

export interface SosGame {
  id: string;
  date: string;
  week: number | null;
  opponent: string;                  // canonical name when rated, ESPN name otherwise
  opponentEspnId: string;
  opponentDivision: 'fbs' | 'fcs' | 'unrated';
  opponentRating: number | null;     // on the FBS scale
  venue: 'home' | 'away' | 'neutral';
  venueEdge: number;                 // points the venue gives THIS team (+ at home, − away)
  adjOpponentRating: number | null;  // opponent rating net of venue = what the game plays like
  pWin: number | null;               // P(a median FBS team wins this game from this seat)
  conferenceGame: boolean;
  completed: boolean;
  won: boolean | null;
  score: string | null;              // "team–opp" when completed
}

export interface SosTeam {
  teamName: string;
  espnName: string | null;
  espnId: string;
  conference: string | null;
  rating: number;
  hfa: number | null;
  games: SosGame[];                  // date order
}

export interface SosResult {
  season: number;
  sigma: number;
  medianRating: number;
  teams: SosTeam[];
  gamesInSchedule: number;
}

export function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function buildSos(
  season: number,
  schedule: ScheduleGame[],
  fbsRatings: Map<string, FbsTeamRating>,
  fcsRatings: Map<string, FcsTeamRating>,
  hfaDefault: number = FBS_DEFAULT_HFA,
  sigma: number = FUTURES_SIGMA
): SosResult {
  const fbsById = new Map<string, FbsTeamRating>();
  for (const r of fbsRatings.values()) if (r.espnId) fbsById.set(r.espnId, r);
  const fcsById = new Map<string, FcsTeamRating>();
  for (const r of fcsRatings.values()) if (r.espnId) fcsById.set(r.espnId, r);

  const medianRating = medianOf([...fbsRatings.values()].map((r) => r.rating));

  const gamesByTeam = new Map<string, SosGame[]>();
  for (const r of fbsById.values()) gamesByTeam.set(r.espnId as string, []);

  for (const g of schedule) {
    for (const side of ['home', 'away'] as const) {
      const teamId = side === 'home' ? g.homeId : g.awayId;
      const team = fbsById.get(teamId);
      if (!team) continue;
      const oppId = side === 'home' ? g.awayId : g.homeId;
      const oppFbs = fbsById.get(oppId);
      const oppFcs = oppFbs ? undefined : fcsById.get(oppId);
      const opponent = oppFbs?.teamName ?? oppFcs?.teamName ?? (side === 'home' ? g.awayName : g.homeName);
      const opponentDivision: SosGame['opponentDivision'] = oppFbs ? 'fbs' : oppFcs ? 'fcs' : 'unrated';
      const opponentRating = oppFbs
        ? oppFbs.rating
        : oppFcs
          ? oppFcs.rating + FCS_TO_FBS_OFFSET_FALLBACK
          : null;
      const venue: SosGame['venue'] = g.neutral ? 'neutral' : side;
      let venueEdge = 0;
      if (!g.neutral) {
        venueEdge = side === 'home'
          ? (team.hfa ?? hfaDefault)
          : -((oppFbs?.hfa ?? oppFcs?.hfa) ?? hfaDefault);
      }
      // Median team in this seat: spread = -((median − opp) + edge); P(win) = Φ(−spread/σ)
      const pWin = opponentRating === null ? null : normalCdf((medianRating - opponentRating + venueEdge) / sigma);
      const completed = g.completed && g.homeScore !== null && g.awayScore !== null;
      const own = side === 'home' ? g.homeScore : g.awayScore;
      const theirs = side === 'home' ? g.awayScore : g.homeScore;
      gamesByTeam.get(teamId)!.push({
        id: g.id,
        date: g.date,
        week: g.week,
        opponent,
        opponentEspnId: oppId,
        opponentDivision,
        opponentRating: opponentRating === null ? null : Math.round(opponentRating * 10) / 10,
        venue,
        venueEdge,
        adjOpponentRating: opponentRating === null ? null : Math.round((opponentRating - venueEdge) * 10) / 10,
        pWin: pWin === null ? null : Math.round(pWin * 1000) / 1000,
        conferenceGame: g.conferenceGame,
        completed,
        won: completed ? (own as number) > (theirs as number) : null,
        score: completed ? `${own}–${theirs}` : null,
      });
    }
  }

  const teams: SosTeam[] = [];
  for (const r of fbsById.values()) {
    const games = gamesByTeam.get(r.espnId as string) ?? [];
    games.sort((a, b) => a.date.localeCompare(b.date));
    teams.push({
      teamName: r.teamName,
      espnName: r.espnName,
      espnId: r.espnId as string,
      conference: r.conference,
      rating: r.rating,
      hfa: r.hfa,
      games,
    });
  }
  teams.sort((a, b) => a.teamName.localeCompare(b.teamName));
  return { season, sigma, medianRating: Math.round(medianRating * 10) / 10, teams, gamesInSchedule: schedule.length };
}
