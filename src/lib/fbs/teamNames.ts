// src/lib/fbs/teamNames.ts

/**
 * Name resolution for the FBS ratings system.
 *
 * Brad Powers uses school short names ("Ohio State", "Miami (FL)"); ESPN uses
 * location + mascot ("Ohio State Buckeyes"); the Odds API uses names that are
 * usually — not always — identical to ESPN displayName.
 *
 * Powers -> ESPN is resolved once at seed time (/api/fbs/seed) and stored on
 * fbs_ratings, so runtime game processing is a plain lookup. Odds API events
 * are matched to ESPN games per-game by normalized name + swapped-orientation
 * fallback (same helper as the FCS engine).
 */

export interface EspnTeam {
  id: string;
  location: string;      // "Ohio State"
  displayName: string;   // "Ohio State Buckeyes"
  shortDisplayName: string;
  nickname: string;
  abbreviation: string;
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

// Powers short name -> ESPN location, for names an exact compact match can't
// resolve. Extend as Powers adds/renames teams (unmatched names are reported
// by /api/fbs/seed).
export const POWERS_ESPN_OVERRIDES: Record<string, string> = {
  'Miami (FL)': 'Miami',
  'USF': 'South Florida',
  'UL-Lafayette': 'Louisiana',
  'UL-Monroe': 'UL Monroe',
  'Connecticut': 'UConn',
  'Massachusetts': 'UMass',
  'FIU': 'Florida International',
  'Appalachian State': 'App State',
  'Sam Houston State': 'Sam Houston',
};

export interface PowersMatch {
  team: EspnTeam;
  confidence: 'override' | 'exact';
}

/**
 * Resolve a Brad Powers short name against the ESPN team list.
 * Powers names are clean school names, so this is exact-match + overrides —
 * no abbreviation expansion needed (unlike the Massey/FCS matcher).
 * Returns null when nothing safe is found (caller logs it for a manual override).
 */
export function matchPowersToEspn(
  powersName: string,
  espnTeams: EspnTeam[]
): PowersMatch | null {
  const byKey = new Map<string, EspnTeam>();
  for (const t of espnTeams) {
    for (const key of [t.location, t.displayName, t.shortDisplayName]) {
      if (key) {
        const k = compact(key);
        if (!byKey.has(k)) byKey.set(k, t);
      }
    }
  }

  const override = POWERS_ESPN_OVERRIDES[powersName];
  if (override) {
    const t =
      byKey.get(compact(override)) ??
      espnTeams.find((x) => compact(x.location) === compact(override));
    return t ? { team: t, confidence: 'override' } : null;
  }

  const exact = byKey.get(compact(powersName));
  if (exact) return { team: exact, confidence: 'exact' };
  return null;
}

/**
 * Match an ESPN game to an Odds API event by team names.
 * Returns the event and whether home/away are swapped relative to ESPN
 * (swapped => the extracted home spread must be negated).
 * Identical to the FCS helper — kept per-league so either engine can drift.
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
  const sameTeam = (espn: string, odds: string): boolean => {
    const o = compact(odds);
    if (espn === o) return true;
    // partial: one contains the other and the shared part is substantial
    return (
      (o.length >= 8 && espn.includes(o)) ||
      (espn.length >= 8 && o.includes(espn))
    );
  };

  // Exact matches win before any containment match ("Miami" must never grab
  // a "Miami (OH)" event just because it appears earlier in the feed)
  for (const ev of events) {
    if (exact(h, ev.home_team) && exact(a, ev.away_team)) {
      return { event: ev, swapped: false };
    }
  }
  for (const ev of events) {
    if (exact(h, ev.away_team) && exact(a, ev.home_team)) {
      return { event: ev, swapped: true };
    }
  }
  for (const ev of events) {
    if (sameTeam(h, ev.home_team) && sameTeam(a, ev.away_team)) {
      return { event: ev, swapped: false };
    }
  }
  for (const ev of events) {
    if (sameTeam(h, ev.away_team) && sameTeam(a, ev.home_team)) {
      return { event: ev, swapped: true };
    }
  }
  return null;
}
