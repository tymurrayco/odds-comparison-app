// src/lib/nfl/sos.ts

/**
 * NFL strength of schedule — the shared builder (src/lib/sos.ts) fed the
 * ESPN regular-season schedule (18 weeks). Teams are joined by ESPN
 * displayName, which is the Ledger's canonical team name. "Conference" in
 * the payload is the NFL division (AFC West …), so the panel's group filter
 * and games-only toggle work per division. Median team = median NFL
 * rating, σ 13 (same as survivor).
 */

import { NFL_DEFAULT_HFA } from './constants';
import { fetchNflSeasonEvents } from './espnSchedule';
import { SURVIVOR_SIGMA } from './survivor';
import { NflTeamRating } from './types';
import { buildSos, SosInputGame, SosResult } from '@/lib/sos';

/* eslint-disable @typescript-eslint/no-explicit-any */

let scheduleCache: { season: number; at: number; games: SosInputGame[] } | null = null;
const SCHEDULE_TTL_MS = 5 * 60 * 1000;

export async function fetchNflSosSchedule(season: number): Promise<SosInputGame[]> {
  if (scheduleCache && scheduleCache.season === season && Date.now() - scheduleCache.at < SCHEDULE_TTL_MS) {
    return scheduleCache.games;
  }
  const events = await fetchNflSeasonEvents(season, [2]);
  const games: SosInputGame[] = [];
  for (const event of events) {
    if (Number(event.season?.type) !== 2) continue;
    const comp = event.competitions?.[0];
    const home = comp?.competitors?.find((c: any) => c.homeAway === 'home');
    const away = comp?.competitors?.find((c: any) => c.homeAway === 'away');
    if (!comp || !home?.team?.displayName || !away?.team?.displayName) continue;
    const completed = comp.status?.type?.completed === true;
    games.push({
      id: String(event.id),
      date: comp.date ?? event.date,
      week: event.week?.number ?? null,
      homeKey: home.team.displayName,
      awayKey: away.team.displayName,
      homeName: home.team.displayName,
      awayName: away.team.displayName,
      neutral: comp.neutralSite === true || comp.venue?.neutral === true,
      conferenceGame: null, // derived: same division
      completed,
      homeScore: completed ? Number(home.score) : null,
      awayScore: completed ? Number(away.score) : null,
    });
  }
  games.sort((a, b) => a.date.localeCompare(b.date));
  scheduleCache = { season, at: Date.now(), games };
  return games;
}

export function buildNflSos(
  season: number,
  schedule: SosInputGame[],
  ratings: Map<string, NflTeamRating>,
  hfaDefault: number = NFL_DEFAULT_HFA,
  sigma: number = SURVIVOR_SIGMA
): SosResult {
  const teams = [...ratings.values()].map((r) => ({
    key: r.teamName,
    teamName: r.teamName,
    espnName: r.espnName,
    espnId: r.espnId,
    conference: r.conference,
    rating: r.rating,
    hfa: r.hfa,
  }));
  return buildSos(season, schedule, teams, () => null, hfaDefault, sigma);
}
