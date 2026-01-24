// src/lib/ratings/team-mapping.ts

/**
 * Team Name Matching for NCAAB
 * 
 * Smart matching logic to map team names between different data sources:
 * - KenPom API (canonical source)
 * - The Odds API  
 * - ESPN API
 * 
 * All manual/specific mappings are stored in the database (ncaab_team_overrides table)
 * and loaded at runtime. This file contains only the generic matching algorithms.
 */

// ============================================
// Name Normalization
// ============================================

/**
 * Common mascot names to strip from team names
 */
const MASCOTS = [
  'wildcats', 'bulldogs', 'tigers', 'bears', 'eagles', 'cardinals', 'hokies',
  'hurricanes', 'panthers', 'yellow jackets', 'fighting irish', 'demon deacons',
  'seminoles', 'blue devils', 'cavaliers', 'spartans', 'buckeyes', 'nittany lions',
  'wolverines', 'hoosiers', 'boilermakers', 'fighting illini', 'hawkeyes', 'badgers',
  'golden gophers', 'cornhuskers', 'scarlet knights', 'terrapins', 'bruins', 'trojans',
  'ducks', 'huskies', 'jayhawks', 'cyclones', 'red raiders', 'mountaineers',
  'horned frogs', 'longhorns', 'sooners', 'cougars', 'knights', 'bearcats',
  'sun devils', 'buffaloes', 'utes', 'volunteers', 'crimson tide', 'razorbacks',
  'gators', 'rebels', 'gamecocks', 'aggies', 'commodores', 'musketeers', 'friars',
  'pirates', 'red storm', 'golden eagles', 'blue demons', 'hoyas', 'gaels', 'rams',
  'flyers', 'wolf pack', 'broncos', 'lobos', 'aztecs', 'shockers', 'tar heels',
  'orange', 'wolfpack', 'thundering herd', 'leathernecks', 'jaguars', 'monarchs',
  'owls', '49ers', 'chanticleers', 'red wolves', 'highlanders', 'terriers', 'bison',
  'explorers', 'billikens', 'bonnies', 'colonials', 'dukes', 'spiders', 'royals',
  'ambassadors', 'patriots', 'lumberjacks', 'screaming eagles', 'hornets', 'hawks',
  'fighting hawks', 'jackrabbits', 'coyotes', 'flames', 'racers', 'mean green',
  'roadrunners', 'anteaters', 'matadors', 'gauchos', 'tritons', 'miners', 'mocs',
  'paladins', 'catamounts', 'keydets', 'retrievers', 'jaspers', 'purple eagles',
  'peacocks', 'dolphins', 'ospreys', 'hatters', 'buccaneers', 'governors', 'skyhawks',
  'redhawks', 'penguins', 'zips', 'rockets', 'chippewas', 'bulls', 'redbirds',
  'sycamores', 'salukis', 'mastodons', 'roos', 'ichabods', 'gorillas', 'beacons',
  'yellowjackets', 'seawolves', 'great danes', 'catamounts', 'phoenix', 'griffins',
  'ramblers', 'crusaders', 'dons', 'toreros', 'waves', 'pilots', 'lakers'
];

/**
 * Build regex pattern for mascot removal
 */
const MASCOT_PATTERN = new RegExp(
  `\\s+(${MASCOTS.join('|')})$`,
  'i'
);

/**
 * Normalize a team name for comparison
 * - Removes mascot names
 * - Normalizes "State" to "St."
 * - Handles common variations
 */
export function normalizeTeamName(name: string): string {
  let normalized = name.toLowerCase().trim();
  
  // Remove mascots
  normalized = normalized.replace(MASCOT_PATTERN, '');
  
  // Normalize whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  // Normalize "State" to "St." for consistency with KenPom
  normalized = normalized.replace(/\bstate\b/gi, 'st.');
  
  // Normalize "Saint" to "St."
  normalized = normalized.replace(/\bsaint\b/gi, 'st.');
  
  // Remove trailing periods
  normalized = normalized.replace(/\.+$/, '');
  
  // Ensure "St" has period
  normalized = normalized.replace(/\bst\b(?!\.)/gi, 'st.');
  
  return normalized.trim();
}

/**
 * Extract significant words from a team name
 * Removes mascots, normalizes St./State, lowercases
 */
function getSignificantWords(teamName: string): string[] {
  let cleaned = teamName.toLowerCase().replace(MASCOT_PATTERN, '').trim();
  
  // Normalize State/St.
  cleaned = cleaned.replace(/\bstate\b/g, 'st');
  cleaned = cleaned.replace(/\bst\.\b/g, 'st');
  cleaned = cleaned.replace(/\bsaint\b/g, 'st');
  
  // Remove punctuation
  cleaned = cleaned.replace(/[.']/g, '');
  
  // Split into words
  const words = cleaned.split(/\s+/).filter(w => w.length > 0);
  
  return words;
}

/**
 * Check if two sets of words match
 * All words from BOTH lists must match (bidirectional)
 */
function wordsMatch(words1: string[], words2: string[]): boolean {
  if (words1.length === 0 || words2.length === 0) {
    return false;
  }
  
  // If one has "st" (state) and the other doesn't, they don't match
  // This prevents "North Dakota" matching "North Dakota St."
  const has1State = words1.includes('st');
  const has2State = words2.includes('st');
  if (has1State !== has2State) {
    return false;
  }
  
  // Word counts should be the same
  if (words1.length !== words2.length) {
    return false;
  }
  
  // All words must match (in any order)
  for (const word of words1) {
    const found = words2.some(w => {
      // Exact match
      if (w === word) return true;
      // One starts with the other (for abbreviations like "Fla" -> "Florida")
      if (w.length >= 3 && word.length >= 3) {
        if (w.startsWith(word) || word.startsWith(w)) return true;
      }
      return false;
    });
    
    if (!found) {
      return false;
    }
  }
  
  return true;
}

// ============================================
// Team Matching Functions
// ============================================

/**
 * Try to match a team name using fuzzy matching
 * Returns the original name - actual matching happens in findTeamByName
 * @deprecated Use findTeamByName instead
 */
export function fuzzyMatchTeam(name: string): string {
  return normalizeTeamName(name);
}

/**
 * Find team rating by name, trying multiple matching strategies
 * This is the main function used for matching ESPN/OddsAPI names to KenPom names
 */
export function findTeamByName(
  teamName: string,
  ratings: Map<string, number>
): { name: string; rating: number } | null {
  // Strategy 1: Exact match
  if (ratings.has(teamName)) {
    return { name: teamName, rating: ratings.get(teamName)! };
  }
  
  // Strategy 2: Case-insensitive exact match
  const lowerName = teamName.toLowerCase();
  for (const [name, rating] of ratings) {
    if (name.toLowerCase() === lowerName) {
      return { name, rating };
    }
  }
  
  // Strategy 3: Normalized match (handles State/St., removes mascots)
  const normalizedInput = normalizeTeamName(teamName);
  for (const [name, rating] of ratings) {
    if (normalizeTeamName(name) === normalizedInput) {
      return { name, rating };
    }
  }
  
  // Strategy 4: Word-based smart matching
  const inputWords = getSignificantWords(teamName);
  
  if (inputWords.length === 0) {
    return null;
  }
  
  for (const [name, rating] of ratings) {
    const ratingWords = getSignificantWords(name);
    
    if (wordsMatch(inputWords, ratingWords)) {
      return { name, rating };
    }
  }
  
  // No match found
  return null;
}

// ============================================
// Legacy exports for backwards compatibility
// ============================================

// These functions are kept for backwards compatibility but are no longer used
// All specific mappings should be in the database (ncaab_team_overrides)

export function oddsApiToKenpom(name: string): string {
  return name; // No hardcoded mappings - use database overrides
}

export function espnToKenpom(name: string): string {
  return name; // No hardcoded mappings - use database overrides  
}

export function kenpomToOddsApi(name: string): string {
  return name; // No hardcoded mappings - use database overrides
}

// Empty type for backwards compatibility
export interface TeamNameMapping {
  kenpom: string;
  oddsApi: string;
  espn?: string;
}

// Empty array - all mappings in database
export const TEAM_NAME_MAPPINGS: TeamNameMapping[] = [];
