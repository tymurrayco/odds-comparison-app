// src/lib/teamNames.ts
//
// Short college names shown on phone card titles, and the team search that
// understands them ("JMU", "Sac St", "App St") along with ESPN abbreviations.

// Schools whose name is still too long for the phone card title after
// "State" → "St"; keyed by that already-shortened name.
export const SHORT_SCHOOL_NAMES: Record<string, string> = {
  'Sacramento St': 'Sac St',
  'Florida International': 'FIU',
  'Pittsburgh': 'Pitt',
  'Appalachian St': 'App St',
  'Coastal Carolina': 'Coastal',
  'James Madison': 'JMU',
  'Georgia Southern': 'Ga Southern',
  'Middle Tennessee': 'MTSU',
  'Middle Tennessee St': 'MTSU',
  'Jacksonville St': 'Jax St',
  'California': 'Cal',
  'Mississippi St': 'Miss St',
};

/** "Arizona State" → "Arizona St"; "James Madison" → "JMU". */
export function shortSchool(school: string): string {
  const short = school.replace(/\bState\b/g, 'St');
  return SHORT_SCHOOL_NAMES[short] ?? short;
}

// First word of the two-word mascots (Yellow Jackets, Sun Devils, Red Sox,
// Maple Leafs, …) — only used when ESPN's team list has no match.
const TWO_WORD_MASCOT_STARTS = new Set([
  'yellow', 'green', 'thundering', 'sun', 'wolf', 'red', 'scarlet', 'fighting', "fightin'", 'blue', 'golden',
  "ragin'", 'mean', 'rainbow', 'crimson', 'big', 'nittany', 'demon', 'horned', 'mountain', 'black', 'great',
  'purple', 'tar', 'river', 'screaming', 'delta', "runnin'", 'white', 'maple', 'trail',
]);

// Pro leagues whose phone card title is logo + mascot ("Bills @ Chiefs")
const MASCOT_TITLE_LEAGUES = new Set([
  'americanfootball_nfl', 'americanfootball_nfl_preseason', 'baseball_mlb', 'baseball_mlb_preseason',
  'americanfootball_cfl', 'basketball_wnba', 'icehockey_nhl', 'basketball_nba',
]);
const COLLEGE_TITLE_LEAGUES = new Set(['americanfootball_ncaaf']);

/** Does this league's phone card title use the short name (see cardTitleName)? */
export function hasShortCardTitle(sportKey: string): boolean {
  return MASCOT_TITLE_LEAGUES.has(sportKey) || COLLEGE_TITLE_LEAGUES.has(sportKey);
}

/**
 * The team name a phone card title shows beside the logo. `info` is the
 * team's entry in the ESPN league map (its `school` is ESPN's location: the
 * school for colleges, the city for pro teams).
 *   - College football: the school without its mascot, long ones shortened
 *     ("West Virginia Mountaineers" → "West Virginia", "Arizona State" →
 *     "Arizona St", "Florida International" → "FIU").
 *   - The pro leagues above: the mascot ("Boston Red Sox" → "Red Sox").
 *   - Every other league: the full name.
 * Without ESPN's entry the split falls back to the last word — or the last
 * two for the common two-word mascots.
 */
export function cardTitleName(sportKey: string, teamName: string, info?: { school?: string } | null): string {
  const college = COLLEGE_TITLE_LEAGUES.has(sportKey);
  if (!college && !MASCOT_TITLE_LEAGUES.has(sportKey)) return teamName;
  const words = teamName.trim().split(/\s+/);
  const mascotWords = words.length > 2 && TWO_WORD_MASCOT_STARTS.has(words[words.length - 2].toLowerCase()) ? 2 : 1;
  if (college) {
    if (info?.school) return shortSchool(info.school);
    return words.length < 2 ? teamName : shortSchool(words.slice(0, -mascotWords).join(' '));
  }
  if (info?.school && teamName.startsWith(info.school + ' ')) return teamName.slice(info.school.length + 1);
  return words.length < 2 ? teamName : words.slice(-mascotWords).join(' ');
}

/**
 * Does a typed search match this team? The full name and the short school
 * name match anywhere ("madison", "sac st"); the ESPN abbreviation matches
 * from its start ("jmu", "bama"), so two letters don't match half the board.
 */
export function teamMatchesSearch(
  teamName: string,
  search: string,
  info?: { school?: string; abbreviation?: string } | null
): boolean {
  const term = search.toLowerCase().trim();
  if (!term) return true;
  if (teamName.toLowerCase().includes(term)) return true;
  // without ESPN's school name, try the name minus its mascot
  const school = info?.school ?? teamName.trim().split(/\s+/).slice(0, -1).join(' ');
  if (school && shortSchool(school).toLowerCase().includes(term)) return true;
  return !!info?.abbreviation && info.abbreviation.toLowerCase().startsWith(term);
}
