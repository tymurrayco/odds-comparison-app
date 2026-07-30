// src/lib/eckel/teamNames.ts
//
// Match Odds API team names ("Ohio State Buckeyes") to CFBD school names
// ("Ohio State"). Longest-normalized-prefix wins, with an override map for
// the names that don't follow the school-then-mascot convention.

const norm = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents (San José State)
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** odds-api name (normalized) -> CFBD school name, for the awkward ones. */
const OVERRIDES: Record<string, string> = {
  'ul monroe warhawks': 'Louisiana Monroe',
  'louisiana ragin cajuns': 'Louisiana',
  'hawaii rainbow warriors': "Hawai'i",
  'umass minutemen': 'UMass',
  'southern miss golden eagles': 'Southern Miss',
  'miami oh redhawks': 'Miami (OH)',
  'app state mountaineers': 'App State',
  'appalachian state mountaineers': 'App State',
  'uconn huskies': 'UConn',
  'san jose state spartans': 'San José State',
  'texas am aggies': 'Texas A&M',
  'utsa roadrunners': 'UTSA',
  'utep miners': 'UTEP',
  'byu cougars': 'BYU',
  'smu mustangs': 'SMU',
  'tcu horned frogs': 'TCU',
  'ucf knights': 'UCF',
  'unlv rebels': 'UNLV',
  'usc trojans': 'USC',
  'lsu tigers': 'LSU',
  'ole miss rebels': 'Ole Miss',
  'fiu panthers': 'Florida International',
  'fau owls': 'Florida Atlantic',
  'middle tennessee blue raiders': 'Middle Tennessee',
  'ut san antonio roadrunners': 'UTSA',
  'nc state wolfpack': 'NC State',
  'houston baptist huskies': 'Houston Christian',
  'albany': 'Albany',
  'sam houston state bearkats': 'Sam Houston',
  'sam houston bearkats': 'Sam Houston',
};

export interface CfbdMatch {
  cfbdName: string;
  confidence: 'override' | 'prefix' | 'exact' | 'none';
}

/**
 * Find the CFBD school for an Odds API team name. cfbdTeams is the list of
 * team names present in the Eckel snapshot.
 */
/** If the word right after a matched school prefix is one of these, the odds
 *  team is a DIFFERENT school ("Tennessee State" is not "Tennessee",
 *  "Alabama A&M" is not "Alabama"). Longest-prefix matching means multi-word
 *  FBS schools ("Appalachian State", "Texas Tech") match their full name
 *  first and never hit this guard. */
const DIFFERENT_SCHOOL_CONTINUATIONS = new Set([
  'state', 'st', 'a', 'am', 'tech', 'southern', 'central', 'western',
  'eastern', 'northern', 'baptist', 'christian', 'valley', 'wesleyan',
]);

export function matchOddsToCfbd(oddsName: string, cfbdTeams: string[]): CfbdMatch {
  const n = norm(oddsName);

  // An override declares the team's true identity — never fall through to
  // prefix matching when it isn't in the snapshot (e.g. FCS Houston
  // Christian must not degrade into FBS Houston).
  const override = OVERRIDES[n];
  if (override) {
    return cfbdTeams.includes(override)
      ? { cfbdName: override, confidence: 'override' }
      : { cfbdName: '', confidence: 'none' };
  }

  // exact normalized equality
  for (const t of cfbdTeams) {
    if (norm(t) === n) return { cfbdName: t, confidence: 'exact' };
  }

  // longest CFBD name that is a word-prefix of the odds name
  // ("miami oh redhawks" matches "miami oh" over "miami"), rejecting
  // prefixes whose continuation indicates a different school.
  const candidates = cfbdTeams
    .map((t) => ({ t, tn: norm(t) }))
    .filter(({ tn }) => n === tn || n.startsWith(tn + ' '))
    .sort((a, b) => b.tn.length - a.tn.length);
  for (const { t, tn } of candidates) {
    const nextWord = n.slice(tn.length).trim().split(' ')[0] || '';
    if (DIFFERENT_SCHOOL_CONTINUATIONS.has(nextWord)) continue;
    return { cfbdName: t, confidence: 'prefix' };
  }

  return { cfbdName: '', confidence: 'none' };
}
