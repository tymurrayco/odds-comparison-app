// src/lib/fbs/sos.ts

/**
 * FBS strength of schedule — the shared builder (src/lib/sos.ts) fed the
 * ESPN FBS schedule, with FCS opponents bridged onto the FBS scale by the
 * cross-division fallback offset. Median team = median FBS rating, σ 13.5
 * (same as futures).
 */

import { FBS_DEFAULT_HFA } from './constants';
import { FbsTeamRating } from './types';
import { FcsTeamRating } from '@/lib/fcs/types';
import { FCS_TO_FBS_OFFSET_FALLBACK } from '@/lib/crossDivision';
import { FUTURES_SIGMA, ScheduleGame } from './futures';
import { buildSos, SosResult } from '@/lib/sos';

export type { SosGame, SosResult, SosTeam } from '@/lib/sos';

export function buildFbsSos(
  season: number,
  schedule: ScheduleGame[],
  fbsRatings: Map<string, FbsTeamRating>,
  fcsRatings: Map<string, FcsTeamRating>,
  hfaDefault: number = FBS_DEFAULT_HFA,
  sigma: number = FUTURES_SIGMA
): SosResult {
  const teams = [...fbsRatings.values()]
    .filter((r) => r.espnId)
    .map((r) => ({
      key: r.espnId as string,
      teamName: r.teamName,
      espnName: r.espnName,
      espnId: r.espnId,
      conference: r.conference,
      rating: r.rating,
      hfa: r.hfa,
    }));
  const fcsById = new Map<string, FcsTeamRating>();
  for (const r of fcsRatings.values()) if (r.espnId) fcsById.set(r.espnId, r);
  const games = schedule.map((g) => ({
    id: g.id,
    date: g.date,
    week: g.week,
    homeKey: g.homeId,
    awayKey: g.awayId,
    homeName: g.homeName,
    awayName: g.awayName,
    neutral: g.neutral,
    conferenceGame: g.conferenceGame,
    completed: g.completed,
    homeScore: g.homeScore,
    awayScore: g.awayScore,
  }));
  return buildSos(
    season,
    games,
    teams,
    (key) => {
      const c = fcsById.get(key);
      return c ? { name: c.teamName, rating: c.rating + FCS_TO_FBS_OFFSET_FALLBACK, hfa: c.hfa, tag: 'FCS' } : null;
    },
    hfaDefault,
    sigma
  );
}
