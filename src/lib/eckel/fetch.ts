// src/lib/eckel/fetch.ts
//
// CFBD API client for Eckel ratings. Bearer token from CFBD_API_KEY.
// Raw responses are cached to .cache/cfbd/ locally (and /tmp on Vercel)
// so re-runs don't re-fetch a whole season of drives.

import fs from 'fs';
import path from 'path';
import os from 'os';
import { EckelDrive, EckelGame } from './types';

const CFBD_BASE = 'https://api.collegefootballdata.com';

function cacheDir(): string {
  const local = path.join(process.cwd(), '.cache', 'cfbd');
  try {
    fs.mkdirSync(local, { recursive: true });
    return local;
  } catch {
    const tmp = path.join(os.tmpdir(), 'cfbd-cache');
    try {
      fs.mkdirSync(tmp, { recursive: true });
      return tmp;
    } catch {
      return '';
    }
  }
}

async function cfbdGet(endpoint: string, params: Record<string, string>): Promise<unknown> {
  const key = process.env.CFBD_API_KEY;
  if (!key) throw new Error('CFBD_API_KEY is not set');

  const qs = new URLSearchParams(params).toString();
  const cacheKey = `${endpoint.replace(/\//g, '_')}-${qs.replace(/[^a-z0-9=&-]/gi, '')}.json`;
  const dir = cacheDir();
  const cachePath = dir ? path.join(dir, cacheKey) : '';

  if (cachePath && fs.existsSync(cachePath)) {
    try {
      return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    } catch {
      // fall through to refetch on corrupt cache
    }
  }

  const resp = await fetch(`${CFBD_BASE}${endpoint}?${qs}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!resp.ok) {
    throw new Error(`CFBD ${endpoint} ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  }
  const data = await resp.json();
  if (cachePath) {
    try {
      fs.writeFileSync(cachePath, JSON.stringify(data));
    } catch {
      // cache write is best-effort
    }
  }
  return data;
}

/* CFBD has served both snake_case and camelCase over API generations —
 * normalize both. */
type Raw = Record<string, unknown>;
const pick = (o: Raw, ...keys: string[]): unknown => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' ? v : fallback);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const bool = (v: unknown): boolean => v === true;

export async function fetchGames(year: number): Promise<EckelGame[]> {
  const raw = (await cfbdGet('/games', {
    year: String(year),
    seasonType: 'regular',
    classification: 'fbs',
  })) as Raw[];
  return raw.map((g) => ({
    id: num(pick(g, 'id')),
    season: num(pick(g, 'season'), year),
    week: num(pick(g, 'week')),
    homeTeam: str(pick(g, 'homeTeam', 'home_team')),
    awayTeam: str(pick(g, 'awayTeam', 'away_team')),
    homePoints: (pick(g, 'homePoints', 'home_points') as number | undefined) ?? null,
    awayPoints: (pick(g, 'awayPoints', 'away_points') as number | undefined) ?? null,
    neutralSite: bool(pick(g, 'neutralSite', 'neutral_site')),
    completed: bool(pick(g, 'completed')),
  }));
}

export async function fetchDrives(year: number): Promise<EckelDrive[]> {
  const raw = (await cfbdGet('/drives', {
    year: String(year),
    seasonType: 'regular',
  })) as Raw[];
  return raw.map((d) => ({
    gameId: num(pick(d, 'gameId', 'game_id')),
    offense: str(pick(d, 'offense')),
    defense: str(pick(d, 'defense')),
    startPeriod: num(pick(d, 'startPeriod', 'start_period')),
    endYardsToGoal: num(pick(d, 'endYardsToGoal', 'end_yards_to_goal'), 100),
    startOffenseScore: num(pick(d, 'startOffenseScore', 'start_offense_score')),
    startDefenseScore: num(pick(d, 'startDefenseScore', 'start_defense_score')),
    endOffenseScore: num(pick(d, 'endOffenseScore', 'end_offense_score')),
    endDefenseScore: num(pick(d, 'endDefenseScore', 'end_defense_score')),
    driveResult: str(pick(d, 'driveResult', 'drive_result')),
    isHomeOffense: bool(pick(d, 'isHomeOffense', 'is_home_offense')),
  }));
}

/** Season data, optionally truncated to weeks <= week (season-to-date). */
export async function fetchSeason(
  year: number,
  week: number | null = null
): Promise<{ drives: EckelDrive[]; games: EckelGame[] }> {
  const [games, drives] = await Promise.all([fetchGames(year), fetchDrives(year)]);
  if (week == null) return { drives, games };
  const keptGames = games.filter((g) => g.week <= week);
  const keptIds = new Set(keptGames.map((g) => g.id));
  return { games: keptGames, drives: drives.filter((d) => keptIds.has(d.gameId)) };
}
