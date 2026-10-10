// src/lib/server/leagueOrder.ts
//
// The order of the league pills on the board: the league with the most games
// today comes first, ties and leagues with none today go by tomorrow's count,
// then the day after, and so on for a week. Leagues with nothing this week go
// by whose next game is soonest; a league with nothing scheduled at all keeps
// its place in LEAGUES, after the rest.
//
// Game times come from the Odds API "events" endpoint, which is free (it does
// not use request credits), one call per league, cached 10 minutes. It lists
// games that have not finished, so "today" counts what is left of today.

import { LEAGUES } from '@/lib/api';

const DAYS = 7;
// The sports day turns over at 4am Eastern, so a late West Coast or Hawaii
// kickoff still belongs to the day it started on.
const dayKey = (ms: number) => new Date(ms - 4 * 3_600_000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

export interface LeagueEvent {
  commence_time: string;
  home_team: string;
  away_team: string;
}

/** A league's games that have not finished (the free "events" list), or [] on any failure. */
export async function leagueEvents(sportKey: string): Promise<LeagueEvent[]> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return [];
  try {
    const res = await fetch(`https://api.the-odds-api.com/v4/sports/${sportKey}/events?apiKey=${apiKey}`, {
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    const events = await res.json();
    return Array.isArray(events) ? (events as LeagueEvent[]) : [];
  } catch {
    return [];
  }
}

const gameTimes = async (sportKey: string): Promise<number[]> =>
  (await leagueEvents(sportKey)).map((e) => new Date(e.commence_time).getTime());

/** Active league ids, busiest day first (see the file header). */
export async function getLeagueOrder(): Promise<string[]> {
  const active = LEAGUES.filter((l) => l.isActive).map((l) => l.id);
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return active;

  const now = Date.now();
  const days = Array.from({ length: DAYS }, (_, i) => dayKey(now + i * 86_400_000));
  const counts = new Map<string, number[]>();
  const nextGame = new Map<string, number>();
  await Promise.all(
    active.map(async (id) => {
      const times = await gameTimes(id);
      counts.set(id, days.map((day) => times.filter((t) => dayKey(t) === day).length));
      nextGame.set(id, times.length ? Math.min(...times) : Infinity);
    })
  );

  // Array.sort is stable: equal leagues keep their LEAGUES order
  return [...active].sort((a, b) => {
    const ca = counts.get(a)!;
    const cb = counts.get(b)!;
    for (let i = 0; i < DAYS; i++) if (ca[i] !== cb[i]) return cb[i] - ca[i];
    const na = nextGame.get(a)!;
    const nb = nextGame.get(b)!;
    return na === nb ? 0 : na < nb ? -1 : 1;
  });
}
