// src/lib/sos.ts

/**
 * Strength of schedule, shared by the FBS / FCS / NFL Ledgers.
 *
 * Every game on a team's slate is priced from the seat that team sits in:
 * the opponent's rating (opponents from another ratings table are bridged
 * onto this sport's scale by the caller) plus the venue edge (the team's
 * own HFA at home, minus the opponent's HFA on the road, nothing on a
 * neutral field). From that spread the normal margin model gives the
 * chance a MEDIAN team of this sport would win the game. Summed over the
 * slate that is the expected record of an average team playing that
 * schedule — the Massey / Torvik view, and the one that survives the
 * game-count, venue and linear-scale problems of summing raw ratings.
 *
 * This module returns per-game numbers only; the panel aggregates them so
 * the same payload serves all-games / remaining / conference-only views.
 */

import { normalCdf } from '@/lib/fbs/futures';

export interface SosInputTeam {
  key: string;                 // joins to SosInputGame.homeKey / awayKey
  teamName: string;
  espnName: string | null;
  espnId: string | null;
  conference: string | null;   // conference (college) or division (NFL)
  rating: number;
  hfa: number | null;
}

export interface SosInputGame {
  id: string;
  date: string;
  week: number | null;
  homeKey: string;
  awayKey: string;
  homeName: string;            // fallback label when the side is unrated
  awayName: string;
  neutral: boolean;
  conferenceGame: boolean | null; // null = derive from the two teams' conference
  completed: boolean;
  homeScore: number | null;
  awayScore: number | null;
}

/** An opponent from another ratings table, already on this sport's scale. */
export interface SosBridgedOpponent {
  name: string;
  rating: number;
  hfa: number | null;
  tag: string;                 // badge shown next to the name, e.g. "FCS"
}

export interface SosGame {
  id: string;
  date: string;
  week: number | null;
  opponent: string;
  opponentKey: string;
  opponentTag: string | null;        // null for an opponent in this sport's own table
  opponentRating: number | null;     // on this sport's scale; null = unrated
  venue: 'home' | 'away' | 'neutral';
  venueEdge: number;                 // points the venue gives THIS team (+ at home, − away)
  adjOpponentRating: number | null;  // opponent rating net of venue = what the game plays like
  pWin: number | null;               // P(a median team wins this game from this seat)
  conferenceGame: boolean;
  completed: boolean;
  won: boolean | null;
  score: string | null;              // "team–opp" when completed
}

export interface SosTeam {
  teamName: string;
  espnName: string | null;
  espnId: string | null;
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

const r1 = (n: number) => Math.round(n * 10) / 10;

export function buildSos(
  season: number,
  games: SosInputGame[],
  teams: SosInputTeam[],
  bridge: (key: string) => SosBridgedOpponent | null,
  hfaDefault: number,
  sigma: number
): SosResult {
  const byKey = new Map<string, SosInputTeam>();
  for (const t of teams) byKey.set(t.key, t);
  const medianRating = medianOf(teams.map((t) => t.rating));

  const gamesByTeam = new Map<string, SosGame[]>();
  for (const t of teams) gamesByTeam.set(t.key, []);

  for (const g of games) {
    for (const side of ['home', 'away'] as const) {
      const teamKey = side === 'home' ? g.homeKey : g.awayKey;
      const team = byKey.get(teamKey);
      if (!team) continue;
      const oppKey = side === 'home' ? g.awayKey : g.homeKey;
      const oppOwn = byKey.get(oppKey);
      const oppBridged = oppOwn ? null : bridge(oppKey);
      const opponent = oppOwn?.teamName ?? oppBridged?.name ?? (side === 'home' ? g.awayName : g.homeName);
      const opponentRating = oppOwn ? oppOwn.rating : oppBridged ? oppBridged.rating : null;
      const oppHfa = oppOwn ? oppOwn.hfa : oppBridged ? oppBridged.hfa : null;
      const venue: SosGame['venue'] = g.neutral ? 'neutral' : side;
      let venueEdge = 0;
      if (!g.neutral) venueEdge = side === 'home' ? (team.hfa ?? hfaDefault) : -(oppHfa ?? hfaDefault);
      // Median team in this seat: spread = -((median − opp) + edge); P(win) = Φ(−spread/σ)
      const pWin = opponentRating === null ? null : normalCdf((medianRating - opponentRating + venueEdge) / sigma);
      const completed = g.completed && g.homeScore !== null && g.awayScore !== null;
      const own = side === 'home' ? g.homeScore : g.awayScore;
      const theirs = side === 'home' ? g.awayScore : g.homeScore;
      const conferenceGame =
        g.conferenceGame ?? (!!oppOwn && team.conference !== null && team.conference === oppOwn.conference);
      gamesByTeam.get(teamKey)!.push({
        id: g.id,
        date: g.date,
        week: g.week,
        opponent,
        opponentKey: oppKey,
        opponentTag: oppOwn ? null : oppBridged ? oppBridged.tag : null,
        opponentRating: opponentRating === null ? null : r1(opponentRating),
        venue,
        venueEdge,
        adjOpponentRating: opponentRating === null ? null : r1(opponentRating - venueEdge),
        pWin: pWin === null ? null : Math.round(pWin * 1000) / 1000,
        conferenceGame,
        completed,
        won: completed ? (own as number) > (theirs as number) : null,
        score: completed ? `${own}–${theirs}` : null,
      });
    }
  }

  const out: SosTeam[] = teams.map((t) => {
    const list = gamesByTeam.get(t.key) ?? [];
    list.sort((a, b) => a.date.localeCompare(b.date));
    return {
      teamName: t.teamName,
      espnName: t.espnName,
      espnId: t.espnId,
      conference: t.conference,
      rating: t.rating,
      hfa: t.hfa,
      games: list,
    };
  });
  out.sort((a, b) => a.teamName.localeCompare(b.teamName));
  return { season, sigma, medianRating: r1(medianRating), teams: out, gamesInSchedule: games.length };
}
