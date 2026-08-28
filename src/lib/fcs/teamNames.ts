// src/lib/fcs/teamNames.ts

/**
 * Name resolution for the FCS ratings system.
 *
 * Massey uses heavily abbreviated names ("S Dakota St", "Cent Arkansas");
 * ESPN uses location + mascot ("South Dakota State Jackrabbits"); the Odds API
 * uses names that are usually — not always — identical to ESPN displayName.
 *
 * Massey -> ESPN is resolved once at seed time (massey-sync) and stored on
 * fcs_ratings, so runtime game processing is a plain lookup. Odds API events
 * are matched to ESPN games per-game by normalized name + swapped-orientation
 * fallback (mirrors findMatchingGame in the NCAAB calculate route).
 */

export interface EspnTeam {
  id: string;
  location: string;      // "South Dakota State"
  displayName: string;   // "South Dakota State Jackrabbits"
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

// Token -> alternative expansions used when exploding Massey abbreviations.
const TOKEN_EXPANSIONS: Record<string, string[]> = {
  st: ['state', 'saint', 'st'],
  s: ['south', 'southern', 's'],
  n: ['north', 'northern', 'n'],
  e: ['east', 'eastern', 'e'],
  w: ['west', 'western', 'w'],
  c: ['central', 'c'],
  cent: ['central'],
  se: ['southeast', 'southeastern', 'se'],
  sw: ['southwest', 'southwestern'],
  ne: ['northeast', 'northeastern'],
  nw: ['northwest', 'northwestern'],
  conn: ['connecticut'],
  ark: ['arkansas'],
  chr: ['christian'],
  tenn: ['tennessee'],
  miss: ['mississippi'],
  wash: ['washington'],
  ill: ['illinois'],
  intl: ['international'],
  univ: ['university'],
  coll: ['college'],
  fla: ['florida'],
  ky: ['kentucky'],
  va: ['virginia'],
  tn: ['tennessee'],
  al: ['alabama'],
  la: ['louisiana'],
};

// Massey name -> ESPN location, for teams the expansion search can't find.
// Extend as Massey adds/renames teams (unmatched names are reported by massey-sync).
export const MASSEY_ESPN_OVERRIDES: Record<string, string> = {
  'Ark Pine Bluff': 'Arkansas-Pine Bluff',
  'Nicholls St': 'Nicholls',
  'McNeese St': 'McNeese',
  'SF Austin': 'Stephen F. Austin',
  'Houston Chr': 'Houston Christian',
  'TX A&M Commerce': 'East Texas A&M',
  'ETSU': 'East Tennessee State',
  'TN Martin': 'UT Martin',
  'Monmouth NJ': 'Monmouth',
  'UTRGV': 'UT Rio Grande Valley',
  'SUNY Albany': 'UAlbany',
  'St Thomas MN': 'St. Thomas',
  'LIU Post': 'Long Island University',
  'TX Southern': 'Texas Southern',
  'Southern Univ': 'Southern',
  'Northwestern LA': 'Northwestern State',
  'MS Valley St': 'Mississippi Valley State',
  'Chicago St': 'Chicago State',
};

// Teams that appear in ESPN scoreboards but are missing from the
// /teams?limit=1000 list (new FCS programs). Ids verified against live events.
export const SUPPLEMENTAL_ESPN_TEAMS: EspnTeam[] = [
  {
    id: '2130',
    location: 'Chicago State',
    displayName: 'Chicago State Cougars',
    shortDisplayName: 'Chicago St',
    nickname: 'Cougars',
    abbreviation: 'CHST',
  },
  {
    id: '292',
    location: 'UT Rio Grande Valley',
    displayName: 'UT Rio Grande Valley Vaqueros',
    shortDisplayName: 'UT Rio Grande',
    nickname: 'Vaqueros',
    abbreviation: 'RGV',
  },
];

/** Explode a Massey name into candidate full names via token expansions. */
function expandVariants(masseyName: string): string[] {
  const tokens = normalizeName(masseyName).split(' ');
  let variants: string[][] = [[]];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    let options: string[];
    if (tok === 'st' && i === 0) {
      options = ['saint', 'st'];
    } else if (tok === 'st') {
      options = ['state', 'st'];
    } else {
      options = TOKEN_EXPANSIONS[tok] ?? [tok];
    }
    const next: string[][] = [];
    for (const v of variants) {
      for (const o of options) next.push([...v, o]);
    }
    variants = next;
    if (variants.length > 256) variants = variants.slice(0, 256);
  }
  return variants.map((v) => v.join(' '));
}

export interface MasseyMatch {
  team: EspnTeam;
  confidence: 'override' | 'exact' | 'variant' | 'fuzzy';
}

/**
 * Resolve a Massey name against the ESPN team list.
 * Returns null when nothing safe is found (caller logs it for a manual override).
 */
export function matchMasseyToEspn(
  masseyName: string,
  espnTeams: EspnTeam[]
): MasseyMatch | null {
  const byKey = new Map<string, EspnTeam>();
  for (const t of espnTeams) {
    for (const key of [t.location, t.displayName, t.shortDisplayName]) {
      if (key) {
        const k = compact(key);
        if (!byKey.has(k)) byKey.set(k, t);
      }
    }
  }

  const override = MASSEY_ESPN_OVERRIDES[masseyName];
  if (override) {
    const t =
      byKey.get(compact(override)) ??
      espnTeams.find((x) => compact(x.location) === compact(override));
    return t ? { team: t, confidence: 'override' } : null;
  }

  const exact = byKey.get(compact(masseyName));
  if (exact) return { team: exact, confidence: 'exact' };

  for (const variant of expandVariants(masseyName)) {
    const t = byKey.get(compact(variant));
    if (t) return { team: t, confidence: 'variant' };
  }

  // Last resort: unique location whose token set contains every expanded token
  // of the best variant (e.g. Massey drops a word ESPN keeps).
  const variantTokenSets = expandVariants(masseyName).map((v) => v.split(' '));
  const candidates = new Set<EspnTeam>();
  for (const t of espnTeams) {
    const locTokens = new Set(normalizeName(t.location).split(' '));
    for (const vt of variantTokenSets) {
      if (vt.every((tok) => locTokens.has(tok))) {
        candidates.add(t);
        break;
      }
    }
  }
  if (candidates.size === 1) {
    return { team: [...candidates][0], confidence: 'fuzzy' };
  }
  return null;
}

/**
 * Match an ESPN game to an Odds API event by team names.
 * Returns the event and whether home/away are swapped relative to ESPN
 * (swapped => the extracted home spread must be negated).
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

  // Exact matches win before any containment match ("Montana" must never
  // grab a "Montana State" event just because it appears earlier in the feed)
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
