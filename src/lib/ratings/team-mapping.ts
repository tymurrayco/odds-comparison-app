// src/lib/ratings/team-mapping.ts

/**
 * Team Name Mapping for NCAAB
 * 
 * Maps team names between different data sources:
 * - KenPom API
 * - The Odds API
 * - ESPN API
 * 
 * KenPom is used as the canonical source since that's where ratings originate.
 * This mapping will need to be expanded as we encounter more variations.
 */

import { TeamNameMapping } from './types';

// ============================================
// Known Team Name Variations
// ============================================

/**
 * Manual mappings for teams where names differ significantly between sources.
 * Key is the KenPom name (canonical), value contains variations.
 * 
 * Only include teams that NEED mapping - teams with identical names
 * across sources don't need to be listed here.
 */
export const TEAM_NAME_MAPPINGS: TeamNameMapping[] = [
  // ACC
  { kenpom: 'North Carolina', oddsApi: 'North Carolina Tar Heels', espn: 'North Carolina' },
  { kenpom: 'NC State', oddsApi: 'NC State Wolfpack', espn: 'NC State' },
  { kenpom: 'Virginia Tech', oddsApi: 'Virginia Tech Hokies', espn: 'Virginia Tech' },
  { kenpom: 'Miami FL', oddsApi: 'Miami Hurricanes', espn: 'Miami' },
  { kenpom: 'Pittsburgh', oddsApi: 'Pittsburgh Panthers', espn: 'Pittsburgh' },
  { kenpom: 'Boston College', oddsApi: 'Boston College Eagles', espn: 'Boston College' },
  { kenpom: 'Georgia Tech', oddsApi: 'Georgia Tech Yellow Jackets', espn: 'Georgia Tech' },
  { kenpom: 'Notre Dame', oddsApi: 'Notre Dame Fighting Irish', espn: 'Notre Dame' },
  { kenpom: 'Wake Forest', oddsApi: 'Wake Forest Demon Deacons', espn: 'Wake Forest' },
  { kenpom: 'Florida St.', oddsApi: 'Florida State Seminoles', espn: 'Florida State' },
  { kenpom: 'Louisville', oddsApi: 'Louisville Cardinals', espn: 'Louisville' },
  { kenpom: 'Syracuse', oddsApi: 'Syracuse Orange', espn: 'Syracuse' },
  { kenpom: 'Clemson', oddsApi: 'Clemson Tigers', espn: 'Clemson' },
  { kenpom: 'Duke', oddsApi: 'Duke Blue Devils', espn: 'Duke' },
  { kenpom: 'Virginia', oddsApi: 'Virginia Cavaliers', espn: 'Virginia' },
  { kenpom: 'California', oddsApi: 'California Golden Bears', espn: 'California' },
  { kenpom: 'Stanford', oddsApi: 'Stanford Cardinal', espn: 'Stanford' },
  { kenpom: 'SMU', oddsApi: 'SMU Mustangs', espn: 'SMU' },
  
  // Big Ten
  { kenpom: 'Michigan St.', oddsApi: 'Michigan State Spartans', espn: 'Michigan St.' },
  { kenpom: 'Ohio St.', oddsApi: 'Ohio State Buckeyes', espn: 'Ohio St.' },
  { kenpom: 'Penn St.', oddsApi: 'Penn State Nittany Lions', espn: 'Penn St.' },
  { kenpom: 'Michigan', oddsApi: 'Michigan Wolverines', espn: 'Michigan' },
  { kenpom: 'Indiana', oddsApi: 'Indiana Hoosiers', espn: 'Indiana' },
  { kenpom: 'Purdue', oddsApi: 'Purdue Boilermakers', espn: 'Purdue' },
  { kenpom: 'Illinois', oddsApi: 'Illinois Fighting Illini', espn: 'Illinois' },
  { kenpom: 'Iowa', oddsApi: 'Iowa Hawkeyes', espn: 'Iowa' },
  { kenpom: 'Wisconsin', oddsApi: 'Wisconsin Badgers', espn: 'Wisconsin' },
  { kenpom: 'Minnesota', oddsApi: 'Minnesota Golden Gophers', espn: 'Minnesota' },
  { kenpom: 'Nebraska', oddsApi: 'Nebraska Cornhuskers', espn: 'Nebraska' },
  { kenpom: 'Northwestern', oddsApi: 'Northwestern Wildcats', espn: 'Northwestern' },
  { kenpom: 'Rutgers', oddsApi: 'Rutgers Scarlet Knights', espn: 'Rutgers' },
  { kenpom: 'Maryland', oddsApi: 'Maryland Terrapins', espn: 'Maryland' },
  { kenpom: 'UCLA', oddsApi: 'UCLA Bruins', espn: 'UCLA' },
  { kenpom: 'USC', oddsApi: 'USC Trojans', espn: 'USC' },
  { kenpom: 'Oregon', oddsApi: 'Oregon Ducks', espn: 'Oregon' },
  { kenpom: 'Washington', oddsApi: 'Washington Huskies', espn: 'Washington' },
  
  // Big 12
  { kenpom: 'Kansas', oddsApi: 'Kansas Jayhawks', espn: 'Kansas' },
  { kenpom: 'Kansas St.', oddsApi: 'Kansas State Wildcats', espn: 'Kansas St.' },
  { kenpom: 'Oklahoma St.', oddsApi: 'Oklahoma State Cowboys', espn: 'Oklahoma St.' },
  { kenpom: 'Iowa St.', oddsApi: 'Iowa State Cyclones', espn: 'Iowa St.' },
  { kenpom: 'Texas Tech', oddsApi: 'Texas Tech Red Raiders', espn: 'Texas Tech' },
  { kenpom: 'West Virginia', oddsApi: 'West Virginia Mountaineers', espn: 'West Virginia' },
  { kenpom: 'Baylor', oddsApi: 'Baylor Bears', espn: 'Baylor' },
  { kenpom: 'TCU', oddsApi: 'TCU Horned Frogs', espn: 'TCU' },
  { kenpom: 'Texas', oddsApi: 'Texas Longhorns', espn: 'Texas' },
  { kenpom: 'Oklahoma', oddsApi: 'Oklahoma Sooners', espn: 'Oklahoma' },
  { kenpom: 'BYU', oddsApi: 'BYU Cougars', espn: 'BYU' },
  { kenpom: 'UCF', oddsApi: 'UCF Knights', espn: 'UCF' },
  { kenpom: 'Cincinnati', oddsApi: 'Cincinnati Bearcats', espn: 'Cincinnati' },
  { kenpom: 'Houston', oddsApi: 'Houston Cougars', espn: 'Houston' },
  { kenpom: 'Arizona', oddsApi: 'Arizona Wildcats', espn: 'Arizona' },
  { kenpom: 'Arizona St.', oddsApi: 'Arizona State Sun Devils', espn: 'Arizona St.' },
  { kenpom: 'Colorado', oddsApi: 'Colorado Buffaloes', espn: 'Colorado' },
  { kenpom: 'Utah', oddsApi: 'Utah Utes', espn: 'Utah' },
  
  // SEC
  { kenpom: 'Kentucky', oddsApi: 'Kentucky Wildcats', espn: 'Kentucky' },
  { kenpom: 'Tennessee', oddsApi: 'Tennessee Volunteers', espn: 'Tennessee' },
  { kenpom: 'Auburn', oddsApi: 'Auburn Tigers', espn: 'Auburn' },
  { kenpom: 'Alabama', oddsApi: 'Alabama Crimson Tide', espn: 'Alabama' },
  { kenpom: 'Arkansas', oddsApi: 'Arkansas Razorbacks', espn: 'Arkansas' },
  { kenpom: 'Florida', oddsApi: 'Florida Gators', espn: 'Florida' },
  { kenpom: 'Georgia', oddsApi: 'Georgia Bulldogs', espn: 'Georgia' },
  { kenpom: 'LSU', oddsApi: 'LSU Tigers', espn: 'LSU' },
  { kenpom: 'Mississippi St.', oddsApi: 'Mississippi State Bulldogs', espn: 'Mississippi St.' },
  { kenpom: 'Ole Miss', oddsApi: 'Ole Miss Rebels', espn: 'Ole Miss' },
  { kenpom: 'Missouri', oddsApi: 'Missouri Tigers', espn: 'Missouri' },
  { kenpom: 'South Carolina', oddsApi: 'South Carolina Gamecocks', espn: 'South Carolina' },
  { kenpom: 'Texas A&M', oddsApi: 'Texas A&M Aggies', espn: 'Texas A&M' },
  { kenpom: 'Vanderbilt', oddsApi: 'Vanderbilt Commodores', espn: 'Vanderbilt' },
  
  // Big East
  { kenpom: 'Connecticut', oddsApi: 'UConn Huskies', espn: 'UConn' },
  { kenpom: 'Villanova', oddsApi: 'Villanova Wildcats', espn: 'Villanova' },
  { kenpom: 'Creighton', oddsApi: 'Creighton Bluejays', espn: 'Creighton' },
  { kenpom: 'Marquette', oddsApi: 'Marquette Golden Eagles', espn: 'Marquette' },
  { kenpom: 'Providence', oddsApi: 'Providence Friars', espn: 'Providence' },
  { kenpom: 'Seton Hall', oddsApi: 'Seton Hall Pirates', espn: 'Seton Hall' },
  { kenpom: "St. John's", oddsApi: "St. John's Red Storm", espn: "St. John's" },
  { kenpom: 'Xavier', oddsApi: 'Xavier Musketeers', espn: 'Xavier' },
  { kenpom: 'Butler', oddsApi: 'Butler Bulldogs', espn: 'Butler' },
  { kenpom: 'DePaul', oddsApi: 'DePaul Blue Demons', espn: 'DePaul' },
  { kenpom: 'Georgetown', oddsApi: 'Georgetown Hoyas', espn: 'Georgetown' },
  
  // Other Notable Programs
  { kenpom: 'Gonzaga', oddsApi: 'Gonzaga Bulldogs', espn: 'Gonzaga' },
  { kenpom: 'San Diego St.', oddsApi: 'San Diego State Aztecs', espn: 'San Diego St.' },
  { kenpom: 'Memphis', oddsApi: 'Memphis Tigers', espn: 'Memphis' },
  { kenpom: 'Wichita St.', oddsApi: 'Wichita State Shockers', espn: 'Wichita St.' },
  { kenpom: "Saint Mary's", oddsApi: "Saint Mary's Gaels", espn: "Saint Mary's" },
  { kenpom: 'VCU', oddsApi: 'VCU Rams', espn: 'VCU' },
  { kenpom: 'Dayton', oddsApi: 'Dayton Flyers', espn: 'Dayton' },
  { kenpom: 'Nevada', oddsApi: 'Nevada Wolf Pack', espn: 'Nevada' },
  { kenpom: 'Boise St.', oddsApi: 'Boise State Broncos', espn: 'Boise St.' },
  { kenpom: 'Colorado St.', oddsApi: 'Colorado State Rams', espn: 'Colorado St.' },
  { kenpom: 'New Mexico', oddsApi: 'New Mexico Lobos', espn: 'New Mexico' },
  { kenpom: 'UNLV', oddsApi: 'UNLV Rebels', espn: 'UNLV' },
  { kenpom: 'Utah St.', oddsApi: 'Utah State Aggies', espn: 'Utah St.' },
  { kenpom: 'Fresno St.', oddsApi: 'Fresno State Bulldogs', espn: 'Fresno St.' },
  { kenpom: 'San Jose St.', oddsApi: 'San Jose State Spartans', espn: 'San Jose St.' },
  { kenpom: 'Air Force', oddsApi: 'Air Force Falcons', espn: 'Air Force' },
  { kenpom: 'Wyoming', oddsApi: 'Wyoming Cowboys', espn: 'Wyoming' },
];

// ============================================
// ESPN to KenPom Direct Mapping
// ============================================

/**
 * Direct mapping from ESPN names to KenPom names
 * This handles cases where ESPN uses different naming than KenPom
 */
const ESPN_TO_KENPOM: Record<string, string> = {
  // State abbreviations
  'Michigan State': 'Michigan St.',
  'Ohio State': 'Ohio St.',
  'Penn State': 'Penn St.',
  'Kansas State': 'Kansas St.',
  'Oklahoma State': 'Oklahoma St.',
  'Iowa State': 'Iowa St.',
  'Arizona State': 'Arizona St.',
  'Mississippi State': 'Mississippi St.',
  'Florida State': 'Florida St.',
  'San Diego State': 'San Diego St.',
  'Wichita State': 'Wichita St.',
  'Boise State': 'Boise St.',
  'Colorado State': 'Colorado St.',
  'Utah State': 'Utah St.',
  'Fresno State': 'Fresno St.',
  'San Jose State': 'San Jose St.',
  'Oregon State': 'Oregon St.',
  'Washington State': 'Washington St.',
  'NC State': 'NC State',
  'Ball State': 'Ball St.',
  'Kent State': 'Kent St.',
  'Appalachian State': 'Appalachian St.',
  'Georgia State': 'Georgia St.',
  'Sacramento State': 'Sacramento St.',
  'Portland State': 'Portland St.',
  'Weber State': 'Weber St.',
  'Idaho State': 'Idaho St.',
  'Montana State': 'Montana St.',
  'Murray State': 'Murray St.',
  'Morehead State': 'Morehead St.',
  'Norfolk State': 'Norfolk St.',
  'Coppin State': 'Coppin St.',
  'Delaware State': 'Delaware St.',
  'South Carolina State': 'South Carolina St.',
  'Alabama State': 'Alabama St.',
  'Jackson State': 'Jackson St.',
  'Alcorn State': 'Alcorn St.',
  'Grambling State': 'Grambling St.',
  'Prairie View A&M': 'Prairie View A&M',
  'Texas Southern': 'Texas Southern',
  
  // UConn variations
  'UConn': 'Connecticut',
  'Connecticut': 'Connecticut',
  
  // Miami variations
  'Miami': 'Miami FL',
  'Miami (FL)': 'Miami FL',
  'Miami (OH)': 'Miami OH',
  'Miami Ohio': 'Miami OH',
  
  // Other common variations
  "St. John's": "St. John's",
  "Saint John's": "St. John's",
  "Saint Mary's": "Saint Mary's",
  "St. Mary's": "Saint Mary's",
  'Ole Miss': 'Ole Miss',
  'Mississippi': 'Ole Miss',
  
  // Southern variations
  'Southern Miss': 'Southern Miss',
  'Southern Mississippi': 'Southern Miss',
  'Southern': 'Southern',
  'Southern University': 'Southern',
  
  // Directional schools - only need explicit mappings for non-obvious ones
  'Southern Miss': 'Southern Miss',
  'Southern Mississippi': 'Southern Miss',
  
  // HBCU and smaller schools
  'Coppin St. Eagles': 'Coppin St.',
  'Morgan State': 'Morgan St.',
  'Howard': 'Howard',
  'Hampton': 'Hampton',
  'NC Central': 'N.C. Central',
  'NC A&T': 'N.C. A&T',
  'North Carolina Central': 'N.C. Central',
  'North Carolina A&T': 'N.C. A&T',
  
  // Mid-majors
  'Loyola Chicago': 'Loyola Chicago',
  'Loyola (MD)': 'Loyola MD',
  'Loyola Marymount': 'Loyola Marymount',
  'Saint Louis': 'Saint Louis',
  'St. Louis': 'Saint Louis',
  "Saint Joseph's": "Saint Joseph's",
  "St. Joseph's": "Saint Joseph's",
  'Saint Peter\'s': "St. Peter's",
  "St. Peter's": "St. Peter's",
  'Saint Bonaventure': 'St. Bonaventure',
  'St. Bonaventure': 'St. Bonaventure',
  
  // Others
  'UNC Greensboro': 'UNC Greensboro',
  'UNCG': 'UNC Greensboro',
  'UNC Wilmington': 'UNC Wilmington',
  'UNCW': 'UNC Wilmington',
  'UNC Asheville': 'UNC Asheville',
  'UNCA': 'UNC Asheville',
  'UT Arlington': 'UT Arlington',
  'Texas-Arlington': 'UT Arlington',
  'UT San Antonio': 'UTSA',
  'UTSA': 'UTSA',
  'UTEP': 'UTEP',
  'Texas-El Paso': 'UTEP',
  'UT Rio Grande Valley': 'UT Rio Grande Valley',
  'UTRGV': 'UT Rio Grande Valley',
  'Central Arkansas': 'Central Arkansas',
  'Little Rock': 'Little Rock',
  'Arkansas-Little Rock': 'Little Rock',
  'Louisiana': 'Louisiana',
  'Louisiana-Lafayette': 'Louisiana',
  'UL Lafayette': 'Louisiana',
  'Louisiana Monroe': 'UL Monroe',
  'UL Monroe': 'UL Monroe',
  'Louisiana-Monroe': 'UL Monroe',
  'Texas State': 'Texas St.',
  'Georgia Southern': 'Georgia Southern',
  'Coastal Carolina': 'Coastal Carolina',
  'App State': 'Appalachian St.',
  'Appalachian State': 'Appalachian St.',
  'James Madison': 'James Madison',
  'Old Dominion': 'Old Dominion',
  'Marshall': 'Marshall',
  'Southern Miss': 'Southern Miss',
};

// ============================================
// Mapping Utilities
// ============================================

/**
 * Build a lookup map from Odds API name to KenPom name
 */
export function buildOddsApiToKenpomMap(): Map<string, string> {
  const map = new Map<string, string>();
  
  for (const mapping of TEAM_NAME_MAPPINGS) {
    // Normalize to lowercase for case-insensitive matching
    map.set(mapping.oddsApi.toLowerCase(), mapping.kenpom);
  }
  
  return map;
}

/**
 * Build a lookup map from ESPN name to KenPom name
 */
export function buildEspnToKenpomMap(): Map<string, string> {
  const map = new Map<string, string>();
  
  // Add from TEAM_NAME_MAPPINGS
  for (const mapping of TEAM_NAME_MAPPINGS) {
    if (mapping.espn) {
      map.set(mapping.espn.toLowerCase(), mapping.kenpom);
    }
  }
  
  // Add from ESPN_TO_KENPOM direct mapping
  for (const [espn, kenpom] of Object.entries(ESPN_TO_KENPOM)) {
    map.set(espn.toLowerCase(), kenpom);
  }
  
  return map;
}

/**
 * Build a lookup map from KenPom name to Odds API name
 */
export function buildKenpomToOddsApiMap(): Map<string, string> {
  const map = new Map<string, string>();
  
  for (const mapping of TEAM_NAME_MAPPINGS) {
    map.set(mapping.kenpom.toLowerCase(), mapping.oddsApi);
  }
  
  return map;
}

// Pre-built maps for performance
const oddsApiToKenpomMap = buildOddsApiToKenpomMap();
const espnToKenpomMap = buildEspnToKenpomMap();
const kenpomToOddsApiMap = buildKenpomToOddsApiMap();

/**
 * Convert an Odds API team name to KenPom name
 */
export function oddsApiToKenpom(oddsApiName: string): string {
  const normalized = oddsApiName.toLowerCase();
  return oddsApiToKenpomMap.get(normalized) || oddsApiName;
}

/**
 * Convert an ESPN team name to KenPom name
 */
export function espnToKenpom(espnName: string): string {
  const normalized = espnName.toLowerCase();
  return espnToKenpomMap.get(normalized) || espnName;
}

/**
 * Convert a KenPom team name to Odds API name
 */
export function kenpomToOddsApi(kenpomName: string): string {
  const normalized = kenpomName.toLowerCase();
  return kenpomToOddsApiMap.get(normalized) || kenpomName;
}

/**
 * Normalize a team name for comparison
 * Removes common suffixes, normalizes spacing, etc.
 */
export function normalizeTeamName(name: string): string {
  let normalized = name
    .toLowerCase()
    // Remove mascot names
    .replace(/\s+(wildcats|bulldogs|tigers|bears|eagles|cardinals|hokies|hurricanes|panthers|yellow jackets|fighting irish|demon deacons|seminoles|blue devils|cavaliers|spartans|buckeyes|nittany lions|wolverines|hoosiers|boilermakers|fighting illini|hawkeyes|badgers|golden gophers|cornhuskers|scarlet knights|terrapins|bruins|trojans|ducks|huskies|jayhawks|cyclones|red raiders|mountaineers|horned frogs|longhorns|sooners|cougars|knights|bearcats|sun devils|buffaloes|utes|volunteers|crimson tide|razorbacks|gators|rebels|gamecocks|aggies|commodores|musketeers|friars|pirates|red storm|golden eagles|blue demons|hoyas|gaels|rams|flyers|wolf pack|broncos|lobos|aztecs|shockers|tar heels|orange|wolfpack|thundering herd|leathernecks|jaguars|monarchs|owls|49ers|chanticleers|red wolves|highlanders|terriers|bison|explorers|billikens|bonnies|colonials|dukes|spiders|royals|ambassadors|patriots|lumberjacks|screaming eagles|hornets|hawks)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Handle "St." vs "State" normalization
  // Convert "State" to "St." for consistency with KenPom
  normalized = normalized.replace(/\bstate\b/gi, 'st.');
  
  // Remove trailing periods
  normalized = normalized.replace(/\.+$/, '');
  
  // Handle common abbreviations
  normalized = normalized.replace(/\bst\b/gi, 'st.');
  
  return normalized.trim();
}

/**
 * Try to match a team name using fuzzy matching
 * Returns the KenPom name if found, otherwise the original name
 */
export function fuzzyMatchTeam(name: string): string {
  // First try ESPN direct mapping
  const espnMatch = espnToKenpom(name);
  if (espnMatch !== name) {
    return espnMatch;
  }
  
  // Try Odds API mapping
  const oddsMatch = oddsApiToKenpom(name);
  if (oddsMatch !== name) {
    return oddsMatch;
  }
  
  // Try normalized matching
  const normalized = normalizeTeamName(name);
  
  // Check against ESPN mappings with normalization
  for (const [espn, kenpom] of Object.entries(ESPN_TO_KENPOM)) {
    if (normalizeTeamName(espn) === normalized) {
      return kenpom;
    }
  }
  
  // Check against TEAM_NAME_MAPPINGS with normalization
  for (const mapping of TEAM_NAME_MAPPINGS) {
    if (normalizeTeamName(mapping.oddsApi) === normalized ||
        normalizeTeamName(mapping.kenpom) === normalized ||
        (mapping.espn && normalizeTeamName(mapping.espn) === normalized)) {
      return mapping.kenpom;
    }
  }
  
  return name;
}

/**
 * Find team rating by name, trying multiple matching strategies
 */
export function findTeamByName(
  teamName: string,
  ratings: Map<string, number>
): { name: string; rating: number } | null {
  // Try exact match first
  if (ratings.has(teamName)) {
    return { name: teamName, rating: ratings.get(teamName)! };
  }
  
  // Try ESPN direct mapping
  const espnName = espnToKenpom(teamName);
  if (espnName !== teamName && ratings.has(espnName)) {
    return { name: espnName, rating: ratings.get(espnName)! };
  }
  
  // Try converting from Odds API format
  const kenpomName = oddsApiToKenpom(teamName);
  if (kenpomName !== teamName && ratings.has(kenpomName)) {
    return { name: kenpomName, rating: ratings.get(kenpomName)! };
  }
  
  // Try fuzzy match
  const fuzzyName = fuzzyMatchTeam(teamName);
  if (fuzzyName !== teamName && ratings.has(fuzzyName)) {
    return { name: fuzzyName, rating: ratings.get(fuzzyName)! };
  }
  
  // Try case-insensitive search
  const lowerName = teamName.toLowerCase();
  for (const [name, rating] of ratings) {
    if (name.toLowerCase() === lowerName) {
      return { name, rating };
    }
  }
  
  // Try normalized search against all ratings
  const normalizedInput = normalizeTeamName(teamName);
  for (const [name, rating] of ratings) {
    if (normalizeTeamName(name) === normalizedInput) {
      return { name, rating };
    }
  }
  
  // Smart matching: extract significant words and find best match
  const inputWords = getSignificantWords(teamName);
  
  if (inputWords.length === 0) {
    return null;
  }
  
  // For single-word teams (like "Duke", "Florida"), match on that word
  // For multi-word teams, ALL significant words must match
  let bestMatch: { name: string; rating: number } | null = null;
  
  for (const [name, rating] of ratings) {
    const ratingWords = getSignificantWords(name);
    
    if (wordsMatch(inputWords, ratingWords)) {
      // If we already have a match, prefer the one with more matching words
      if (!bestMatch) {
        bestMatch = { name, rating };
      }
    }
  }
  
  return bestMatch;
}

/**
 * Extract significant words from a team name
 * Removes mascots, normalizes St./State, lowercases
 */
function getSignificantWords(teamName: string): string[] {
  // Remove mascots first
  const mascotPattern = /\s+(wildcats|bulldogs|tigers|bears|eagles|cardinals|hokies|hurricanes|panthers|yellow jackets|fighting irish|demon deacons|seminoles|blue devils|cavaliers|spartans|buckeyes|nittany lions|wolverines|hoosiers|boilermakers|fighting illini|hawkeyes|badgers|golden gophers|cornhuskers|scarlet knights|terrapins|bruins|trojans|ducks|huskies|jayhawks|cyclones|red raiders|mountaineers|horned frogs|longhorns|sooners|cougars|knights|bearcats|sun devils|buffaloes|utes|volunteers|crimson tide|razorbacks|gators|rebels|gamecocks|aggies|commodores|musketeers|friars|pirates|red storm|golden eagles|blue demons|hoyas|gaels|rams|flyers|wolf pack|broncos|lobos|aztecs|shockers|tar heels|orange|wolfpack|thundering herd|leathernecks|jaguars|monarchs|owls|49ers|chanticleers|red wolves|highlanders|terriers|bison|explorers|billikens|bonnies|colonials|dukes|spiders|royals|ambassadors|patriots|lumberjacks|screaming eagles|hornets|hawks|fighting hawks|jackrabbits|coyotes|flames|racers|mean green|roadrunners|anteaters|matadors|gauchos|highlanders|tritons|aggies|miners|mocs|paladins|catamounts|keydets|retrievers|jaspers|purple eagles|peacocks|dolphins|ospreys|hatters|buccaneers|governors|skyhawks|redhawks|penguins|zips|rockets|chippewas|huskies|broncos|bulls|cardinals|redbirds|sycamores|salukis|mastodons|jaguars|roos|ichabods|gorillas|beacons|yellowjackets)$/i;
  
  let cleaned = teamName.toLowerCase().replace(mascotPattern, '').trim();
  
  // Normalize State/St.
  cleaned = cleaned.replace(/\bstate\b/g, 'st');
  cleaned = cleaned.replace(/\bst\.\b/g, 'st');
  cleaned = cleaned.replace(/\bst\b/g, 'st');
  
  // Remove punctuation
  cleaned = cleaned.replace(/[.']/g, '');
  
  // Split into words
  const words = cleaned.split(/\s+/).filter(w => w.length > 0);
  
  return words;
}

/**
 * Check if two sets of words match
 * All words from BOTH lists must match (not just one direction)
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
  
  // Word counts should be the same (after removing state indicator)
  // This prevents partial matches
  if (words1.length !== words2.length) {
    return false;
  }
  
  // All words must match (in any order)
  for (const word of words1) {
    const found = words2.some(w => {
      // Exact match
      if (w === word) return true;
      // One contains the other (for abbreviations)
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
