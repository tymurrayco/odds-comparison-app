// src/lib/nfl/teamNames.ts

/**
 * Name resolution for the NFL Ledger. The Odds API, ESPN displayName and the
 * canonical team_name are all full "Kansas City Chiefs"-style names, so this
 * is a normalized exact match plus a tiny alias table (Sagarin still prints
 * "Washington Redskins"). matchOddsEvent is the same helper the FBS/FCS
 * engines use for per-game Odds API matching.
 */

export interface EspnTeam {
  id: string;
  location: string;      // "Kansas City"
  displayName: string;   // "Kansas City Chiefs"
  shortDisplayName: string;
  nickname: string;      // "Chiefs"
  abbreviation: string;  // "KC"
}

export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const compact = (s: string) => normalizeName(s).replace(/ /g, '');

// Legacy / shorthand names seen in outside rating lists -> ESPN displayName
export const NFL_NAME_ALIASES: Record<string, string> = {
  'washington redskins': 'Washington Commanders',
  'washington football team': 'Washington Commanders',
  'oakland raiders': 'Las Vegas Raiders',
  'st louis rams': 'Los Angeles Rams',
  'san diego chargers': 'Los Angeles Chargers',
  'la rams': 'Los Angeles Rams',
  'la chargers': 'Los Angeles Chargers',
  'ny giants': 'New York Giants',
  'ny jets': 'New York Jets',
};

/** Resolve any full-name variant to an ESPN team, or null. */
export function matchNflTeam(name: string, espnTeams: EspnTeam[]): EspnTeam | null {
  const alias = NFL_NAME_ALIASES[normalizeName(name)];
  const target = compact(alias ?? name);
  for (const t of espnTeams) {
    if (compact(t.displayName) === target) return t;
  }
  for (const t of espnTeams) {
    if (compact(t.location) === target || compact(t.nickname) === target) return t;
  }
  // "LA Rams"-style: location initials + nickname
  for (const t of espnTeams) {
    const nick = compact(t.nickname);
    if (nick && nick.length >= 4 && target.endsWith(nick)) {
      const prefix = target.slice(0, -nick.length);
      const initials = t.location
        .split(/\s+/)
        .map((w) => w[0]?.toLowerCase() ?? '')
        .join('');
      if (prefix === initials || prefix === compact(t.location)) return t;
    }
  }
  return null;
}

/**
 * Match an ESPN game to an Odds API event by team names (with swapped
 * orientation fallback: swapped => negate the extracted home spread).
 */
export function matchOddsEvent<
  T extends { home_team: string; away_team: string; commence_time?: string }
>(
  espnHome: string,
  espnAway: string,
  events: T[]
): { event: T; swapped: boolean } | null {
  const h = compact(espnHome);
  const a = compact(espnAway);
  const exact = (espn: string, odds: string): boolean => espn === compact(odds);
  for (const ev of events) {
    if (exact(h, ev.home_team) && exact(a, ev.away_team)) return { event: ev, swapped: false };
  }
  for (const ev of events) {
    if (exact(h, ev.away_team) && exact(a, ev.home_team)) return { event: ev, swapped: true };
  }
  return null;
}
