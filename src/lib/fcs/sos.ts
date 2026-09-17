// src/lib/fcs/sos.ts

/**
 * FCS strength of schedule — the shared builder (src/lib/sos.ts) fed the
 * ESPN FCS regular-season schedule (groups=81, weeks 1–15, playoffs
 * excluded), with FBS opponents bridged DOWN onto the FCS scale by the
 * cross-division fallback offset. Median team = median FCS rating, σ 13.5.
 */

import { ESPN_FCS_GROUP, ESPN_FCS_SCOREBOARD_URL, FCS_DEFAULT_HFA } from './constants';
import { FcsTeamRating } from './types';
import { FbsTeamRating } from '@/lib/fbs/types';
import { FCS_TO_FBS_OFFSET_FALLBACK } from '@/lib/crossDivision';
import { FUTURES_SIGMA, ScheduleGame } from '@/lib/fbs/futures';
import { buildSos, SosResult } from '@/lib/sos';

const REGULAR_SEASON_WEEKS = 15;

/* eslint-disable @typescript-eslint/no-explicit-any */

let scheduleCache: { season: number; at: number; games: ScheduleGame[] } | null = null;
const SCHEDULE_TTL_MS = 5 * 60 * 1000;

/** Every regular-season game involving an FCS team, deduped by ESPN id. */
export async function fetchFcsSeasonSchedule(season: number): Promise<ScheduleGame[]> {
  if (scheduleCache && scheduleCache.season === season && Date.now() - scheduleCache.at < SCHEDULE_TTL_MS) {
    return scheduleCache.games;
  }
  const byId = new Map<string, ScheduleGame>();
  const weeks = Array.from({ length: REGULAR_SEASON_WEEKS }, (_, i) => i + 1);
  const pages = await Promise.all(
    weeks.map(async (week) => {
      const url = `${ESPN_FCS_SCOREBOARD_URL}?dates=${season}&seasontype=2&week=${week}&groups=${ESPN_FCS_GROUP}&limit=400`;
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
      if (/^TBD/i.test(homeName) || /^TBD/i.test(awayName)) continue;
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

export function buildFcsSos(
  season: number,
  schedule: ScheduleGame[],
  fcsRatings: Map<string, FcsTeamRating>,
  fbsRatings: Map<string, FbsTeamRating>,
  hfaDefault: number = FCS_DEFAULT_HFA,
  sigma: number = FUTURES_SIGMA
): SosResult {
  const teams = [...fcsRatings.values()]
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
  const fbsById = new Map<string, FbsTeamRating>();
  for (const r of fbsRatings.values()) if (r.espnId) fbsById.set(r.espnId, r);
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
      const f = fbsById.get(key);
      return f ? { name: f.teamName, rating: f.rating - FCS_TO_FBS_OFFSET_FALLBACK, hfa: f.hfa, tag: 'FBS' } : null;
    },
    hfaDefault,
    sigma
  );
}
