// src/lib/neutralSites.ts
//
// NCAAF neutral-site games from CollegeFootballData. CFBD carries an
// authoritative `neutralSite` flag (the Odds API carries no venue data at
// all), so kickoff classics and bowls can be handled without applying a
// home team's HFA to a game played on a third field.

export interface NeutralGame {
  date: string;       // YYYY-MM-DD (UTC date of kickoff)
  homeTeam: string;   // CFBD names — the nominal home team
  awayTeam: string;
  venue: string | null;
  city: string | null;
  state: string | null;      // US state code; '' / null for international
  country: string | null;    // ISO code, 'US' for domestic
  dome: boolean | null;
  capacity: number | null;
  elevationFt: number | null;
}

/** "Dublin, Ireland" / "Atlanta, GA" — empty string if nothing is known. */
export function venueLocation(g: NeutralGame): string {
  const parts: string[] = [];
  if (g.city) parts.push(g.city);
  if (g.state) parts.push(g.state);
  else if (g.country && g.country !== 'US') parts.push(COUNTRY_NAMES[g.country] ?? g.country);
  return parts.join(', ');
}

const COUNTRY_NAMES: Record<string, string> = {
  IE: 'Ireland', GB: 'United Kingdom', MX: 'Mexico', CA: 'Canada',
  DE: 'Germany', AU: 'Australia', JP: 'Japan', BS: 'Bahamas', IT: 'Italy',
};

const normName = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Continuations that mean a DIFFERENT school, so "Tennessee State" never
// resolves to "Tennessee" on a prefix match.
const DIFFERENT_SCHOOL_CONTINUATIONS = new Set([
  'state', 'st', 'a', 'am', 'tech', 'southern', 'central', 'western', 'eastern',
  'northern', 'baptist', 'christian', 'valley', 'wesleyan', 'atlantic', 'international',
]);

/** Parenthetical disambiguator, e.g. "Miami (OH) RedHawks" -> "oh". */
const parenTag = (s: string) => (s.match(/\(([^)]*)\)/)?.[1] ?? '').toLowerCase().trim();

/** True if an odds-API name ("Ohio State Buckeyes") refers to a CFBD school ("Ohio State"). */
function sameTeam(oddsName: string, cfbdName: string): boolean {
  // A parenthetical qualifier is the whole point of the name — "Miami (OH)"
  // must never match plain "Miami" (CFBD's name for the Hurricanes).
  if (parenTag(oddsName) !== parenTag(cfbdName)) return false;

  const on = normName(oddsName);
  const cn = normName(cfbdName);
  if (!on || !cn) return false;
  if (on === cn) return true;
  if (!on.startsWith(cn + ' ')) return false;
  const nextWord = on.slice(cn.length + 1).split(' ')[0];
  return !DIFFERENT_SCHOOL_CONTINUATIONS.has(nextWord);
}

/**
 * Find the neutral-site entry for a game, if any. Team names are compared in
 * BOTH orientations — sources disagree about which side is "home" for a game
 * played at neither team's stadium. Kickoff dates are allowed to differ by a
 * day, since the odds feed's UTC timestamp can roll past midnight for night games.
 */
export function findNeutralGame(
  games: NeutralGame[],
  awayOddsName: string,
  homeOddsName: string,
  commenceTime?: string
): NeutralGame | null {
  const target = commenceTime ? new Date(commenceTime) : null;
  for (const g of games) {
    const matched =
      (sameTeam(awayOddsName, g.awayTeam) && sameTeam(homeOddsName, g.homeTeam)) ||
      (sameTeam(awayOddsName, g.homeTeam) && sameTeam(homeOddsName, g.awayTeam));
    if (!matched) continue;
    if (target) {
      const days = Math.abs(new Date(g.date + 'T12:00:00Z').getTime() - target.getTime()) / 86_400_000;
      if (days > 1.5) continue;
    }
    return g;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Client-side fetch with a module-level promise cache: every GameCard can call
// this, but only one request is made per page load (same pattern as feiData).
// ---------------------------------------------------------------------------

let cached: Promise<NeutralGame[]> | null = null;

export function fetchNeutralGames(): Promise<NeutralGame[]> {
  if (!cached) {
    cached = fetch('/api/neutral-sites')
      .then((r) => (r.ok ? r.json() : { games: [] }))
      .then((d) => (Array.isArray(d.games) ? (d.games as NeutralGame[]) : []))
      .catch(() => []);
  }
  return cached;
}
