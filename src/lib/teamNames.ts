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
