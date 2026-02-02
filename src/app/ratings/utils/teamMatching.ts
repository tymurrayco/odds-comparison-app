// src/app/ratings/utils/teamMatching.ts
// Shared team name normalization and matching utilities

// Common mascots to strip from team names
export const MASCOTS_AND_SUFFIXES = [
  'hoosiers', 'boilermakers', 'wildcats', 'commodores', 'crimson tide',
  'tigers', 'cavaliers', 'fighting irish', 'flyers', 'rams', 'huskies',
  'friars', 'flames', 'sycamores', 'cardinals', 'billikens', 'revolutionaries',
  'hokies', 'yellow jackets', 'mountaineers', 'golden eagles', 'bluejays',
  'spartans', 'broncos', 'ramblers', 'hawks', 'redhawks', 'minutemen',
  'bulldogs', 'bears', 'eagles', 'lions', 'panthers', 'devils', 'blue devils',
  'tar heels', 'wolfpack', 'seminoles', 'hurricanes', 'orange', 'cardinal',
  'bruins', 'trojans', 'ducks', 'beavers', 'cougars', 'utes', 'buffaloes',
  'jayhawks', 'cyclones', 'longhorns', 'sooners', 'cowboys', 'horned frogs',
  'red raiders', 'aggies', 'razorbacks', 'rebels', 'volunteers', 'gamecocks',
  'gators', 'dawgs', 'demon deacons',
  'owls', 'pirates', 'gaels', 'zags', 'gonzaga bulldogs', 'shockers',
  'musketeers', 'bearcats', 'explorers', 'bonnies', 'dukes', 'colonials',
  'spiders', 'hatters', 'mean green', 'roadrunners', 'miners', 'aztecs',
  'falcons', 'rockets', 'chippewas', 'bulls', 'thundering herd',
  'bobcats', 'golden flashes', 'zips', 'penguins'
];

// Extended mascot list for fuzzy matching (includes more variations)
export const EXTENDED_MASCOTS_REGEX = /\s+(bulldogs|wildcats|tigers|bears|eagles|hawks|cardinals|blue devils|hoosiers|boilermakers|wolverines|buckeyes|spartans|badgers|gophers|hawkeyes|fighting irish|crimson tide|volunteers|razorbacks|rebels|aggies|longhorns|sooners|cowboys|horned frogs|jayhawks|cyclones|mountaineers|red raiders|golden eagles|panthers|cougars|huskies|ducks|beavers|bruins|trojans|sun devils|utes|buffaloes|aztecs|wolf pack|lobos|owls|mean green|roadrunners|miners|mustangs|golden hurricane|shockers|bearcats|red storm|pirates|blue demons|billikens|musketeers|explorers|gaels|zags|gonzaga bulldogs|toreros|matadors|anteaters|gauchos|highlanders|tritons|49ers|beach|titans|broncos|waves|pilots|lions|leopards|big green|crimson|elis|quakers|orange|hokies|cavaliers|tar heels|wolfpack|demon deacons|yellow jackets|seminoles|hurricanes|fighting illini|cornhuskers|nittany lions|terrapins|scarlet knights|hoyas|friars|bluejays|johnnies|red foxes|rams|bonnies|dukes|flyers|colonials|spiders|phoenix|redhawks|penguins|golden flashes|rockets|chippewas|bulls|thundering herd|bobcats|zips|falcons)$/i;

/**
 * Normalize team name for matching - aggressive normalization
 * Used for comparing teams across different data sources
 */
export function normalizeTeamName(name: string): string {
  let normalized = name.toLowerCase();
  
  // Remove mascots
  for (const mascot of MASCOTS_AND_SUFFIXES) {
    normalized = normalized.replace(mascot, '');
  }
  
  return normalized
    .replace(/[^a-z0-9\s]/g, '') // Remove special chars but keep spaces initially
    .replace(/\s+/g, ' ')        // Normalize spaces
    .trim()
    .replace(/\s/g, '')          // Now remove spaces
    .replace(/state/g, 'st')
    .replace(/university/g, '')
    .replace(/college/g, '')
    .replace(/northern/g, 'n')
    .replace(/southern/g, 's')
    .replace(/eastern/g, 'e')
    .replace(/western/g, 'w');
}

/**
 * Normalize for fuzzy matching - less aggressive, preserves more structure
 * Used for matching BT names to Odds API names
 */
export function normalizeForFuzzyMatch(name: string): string {
  return name.toLowerCase()
    .replace(EXTENDED_MASCOTS_REGEX, '')
    .replace(/\(.*?\)/g, '')
    .replace(/st\./g, 'state')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if two team names match using fuzzy logic
 */
export function teamsMatch(name1: string, name2: string): boolean {
  const norm1 = normalizeForFuzzyMatch(name1);
  const norm2 = normalizeForFuzzyMatch(name2);
  
  return norm1 === norm2 || 
         norm1.includes(norm2) || 
         norm2.includes(norm1);
}

/**
 * Parse time string to minutes since midnight
 * Handles formats: "7:00 PM", "10:00 AM", "12:30 PM", "19:00"
 */
export function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 9999; // No time goes to end
  
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return 9999;
  
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = (match[3] || '').toUpperCase();
  
  // Convert to 24-hour format
  if (period === 'PM' && hours !== 12) {
    hours += 12;
  } else if (period === 'AM' && hours === 12) {
    hours = 0;
  }
  
  return hours * 60 + minutes;
}

/**
 * Check if a game has started based on time string (for today's games)
 */
export function hasGameStarted(timeStr: string, isToday: boolean): boolean {
  if (!isToday) return false;
  if (!timeStr) return false;
  
  try {
    const now = new Date();
    const trimmed = timeStr.trim();
    
    let hour24: number;
    let minutes: number = 0;
    
    // Check if it's 24-hour format (no AM/PM)
    if (!trimmed.match(/[APap][Mm]$/)) {
      const parts = trimmed.split(':');
      hour24 = parseInt(parts[0], 10);
      minutes = parseInt(parts[1], 10) || 0;
    } else {
      // 12-hour format with AM/PM
      const match = trimmed.match(/(\d+):?(\d*)\s*([APap][Mm])/);
      if (!match) return false;
      
      const hours = parseInt(match[1], 10);
      minutes = parseInt(match[2], 10) || 0;
      const period = match[3].toUpperCase();
      
      if (period === 'PM' && hours !== 12) {
        hour24 = hours + 12;
      } else if (period === 'AM' && hours === 12) {
        hour24 = 0;
      } else {
        hour24 = hours;
      }
    }
    
    const gameDateTime = new Date();
    gameDateTime.setHours(hour24, minutes, 0, 0);
    
    return now > gameDateTime;
  } catch {
    return false;
  }
}

/**
 * Get date label and flags for a game date
 */
export function getDateInfo(gameDate: string): {
  label: string;
  isToday: boolean;
  isTomorrow: boolean;
  isDay2: boolean;
  isDay3: boolean;
} {
  const now = new Date();
  const eastern = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  
  const formatDate = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const todayStr = formatDate(eastern);
  
  const tomorrow = new Date(eastern);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = formatDate(tomorrow);
  
  const day2 = new Date(eastern);
  day2.setDate(day2.getDate() + 2);
  const day2Str = formatDate(day2);
  
  const day3 = new Date(eastern);
  day3.setDate(day3.getDate() + 3);
  const day3Str = formatDate(day3);
  
  if (gameDate === todayStr) {
    return { label: 'Today', isToday: true, isTomorrow: false, isDay2: false, isDay3: false };
  } else if (gameDate === tomorrowStr) {
    return { label: 'Tomorrow', isToday: false, isTomorrow: true, isDay2: false, isDay3: false };
  } else {
    const [year, month, day] = gameDate.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    
    if (gameDate === day2Str) {
      return { label, isToday: false, isTomorrow: false, isDay2: true, isDay3: false };
    } else if (gameDate === day3Str) {
      return { label, isToday: false, isTomorrow: false, isDay2: false, isDay3: true };
    } else {
      return { label, isToday: false, isTomorrow: false, isDay2: false, isDay3: false };
    }
  }
}
