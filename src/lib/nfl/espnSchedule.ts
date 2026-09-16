import { ESPN_NFL_SCOREBOARD_URL } from './constants';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * ESPN's NFL scoreboard stopped accepting `dates=YYYYMMDD-YYYYMMDD` ranges
 * (2026-09-15: every range form answers 400 "Failed to get events endpoint").
 * The per-week form `dates=<season>&seasontype=<type>&week=<n>` still works, so
 * season-wide reads page through the weeks and merge by event id.
 *
 * seasontype 2 = regular season (weeks 1–18), 3 = postseason (1 WC, 2 DIV,
 * 3 CONF, 4 Pro Bowl, 5 Super Bowl). Single-day reads (`dates=YYYYMMDD`) are
 * unaffected and stay where they are.
 */
const REGULAR_SEASON_WEEKS = 18;
const POSTSEASON_WEEKS = 5;
const CACHE_TTL_MS = 60 * 1000;

type SeasonType = 2 | 3;
const cache = new Map<string, { at: number; events: any[] }>();

async function fetchWeek(season: number, seasonType: SeasonType, week: number): Promise<any[]> {
  const url = `${ESPN_NFL_SCOREBOARD_URL}?dates=${season}&seasontype=${seasonType}&week=${week}&limit=100`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN scoreboard HTTP ${res.status} (season ${season} type ${seasonType} week ${week})`);
  const json = await res.json();
  return Array.isArray(json.events) ? json.events : [];
}

/** Every ESPN event for the given season types, deduped by id, oldest first. Cached 60s in-process. */
export async function fetchNflSeasonEvents(
  season: number,
  seasonTypes: SeasonType[] = [2],
): Promise<any[]> {
  const key = `${season}:${seasonTypes.join(',')}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.events;

  const jobs: Array<Promise<any[]>> = [];
  for (const type of seasonTypes) {
    const weeks = type === 2 ? REGULAR_SEASON_WEEKS : POSTSEASON_WEEKS;
    for (let week = 1; week <= weeks; week++) jobs.push(fetchWeek(season, type, week));
  }
  const pages = await Promise.all(jobs);

  const byId = new Map<string, any>();
  for (const page of pages) {
    for (const event of page) {
      if (event?.id == null) continue;
      byId.set(String(event.id), event);
    }
  }
  const events = [...byId.values()].sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')));
  cache.set(key, { at: Date.now(), events });
  return events;
}
