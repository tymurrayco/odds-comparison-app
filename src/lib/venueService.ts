// src/lib/venueService.ts

/**
 * Interfaces for ESPN data structures
 */
interface ESPNEvent {
  id: string;
  name: string;
  date: string;
  competitions: ESPNCompetition[];
}

interface ESPNCompetition {
  competitors: ESPNCompetitor[];
  venue?: ESPNVenue;
}

interface ESPNCompetitor {
  homeAway: 'home' | 'away';
  team: ESPNTeam;
}

interface ESPNTeam {
  displayName: string;
  shortDisplayName?: string;
  name?: string;
  location?: string;
  abbreviation?: string;
}

interface ESPNVenue {
  fullName: string;
  address?: {
    city?: string;
    state?: string;
  };
}

interface ScoredMatch {
  event: ESPNEvent;
  score: number;
  homeTeam?: string;
  awayTeam?: string;
}
export interface VenueInfo {
  venue: string;        // Name of the venue/stadium
  city?: string;        // City of the venue
  state?: string;       // State of the venue
  isNeutral?: boolean;  // Whether it's a neutral site game
  correctedHomeTeam?: string; // Used when ESPN and odds API disagree on home team
  correctedAwayTeam?: string; // Used when ESPN and odds API disagree on away team
}

interface CachedVenueData {
  venues: { [key: string]: VenueInfo };
  timestamp: number;
}

// Import Game interface
import { Game } from './api';

/**
 * Constants
 */
const CACHE_KEY = 'sports_odds_venue_cache';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const API_BASE_URL = 'https://www.thesportsdb.com/api/v1/json/3';

// League mappings for ESPN API
const LEAGUE_MAPPINGS: {[key: string]: string} = {
  'ncaaf': 'college-football',
  'ncaam': 'mens-college-basketball',
  'ncaab': 'mens-college-basketball',
  'ncaaw': 'womens-college-basketball'
};

/**
 * Gets venue information for a specific game
 */
export async function getVenueForGame(
  homeTeam: string, 
  awayTeam: string, 
  date?: string
): Promise<VenueInfo | null> {
  // Create a unique key for this matchup
  const gameKey = date 
    ? `${homeTeam}_vs_${awayTeam}_${date}` 
    : `${homeTeam}_vs_${awayTeam}`;
  
  // Check cache first
  const cachedVenue = getVenueFromCache(gameKey);
  if (cachedVenue) {
    return cachedVenue;
  }
  
  try {
    // Try the existing methods
    const venueInfo = await fetchEventVenue(homeTeam, awayTeam, date);
    
    if (venueInfo) {
      // Save to cache
      saveVenueToCache(gameKey, venueInfo);
      return venueInfo;
    }
    
    // Fall back to home team's venue
    const teamVenue = await fetchTeamVenue(homeTeam);
    if (teamVenue) {
      saveVenueToCache(gameKey, teamVenue);
      return teamVenue;
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching venue:', error);
    return null;
  }
}

/**
 * Gets venue information from ESPN API for a specific game
 * Also checks if home/away teams are correctly designated
 */
export async function getVenueFromESPN(game: Game): Promise<VenueInfo | null> {
  try {
    // Map sport_key to ESPN format
    const sportLeague = getSportAndLeague(game.sport_key);
    if (!sportLeague) return null;
    
    // Skip problematic leagues
    if (sportLeague.league === 'epl') {
      return null;
    }
    
    // Map league if needed
    const mappedLeague = LEAGUE_MAPPINGS[sportLeague.league] || sportLeague.league;
    
    // Format date for API query (YYYYMMDD)
    const gameDate = new Date(game.commence_time).toISOString().split('T')[0].replace(/-/g, '');
    
    try {
      // Query ESPN scoreboard for the specific date
      const scoreboardUrl = `http://site.api.espn.com/apis/site/v2/sports/${sportLeague.sport}/${mappedLeague}/scoreboard?dates=${gameDate}`;
      const response = await fetch(scoreboardUrl);
      
      if (!response.ok) {
        console.error(`ESPN API error for ${sportLeague.sport}/${mappedLeague}: ${response.status}`);
        return null;
      }
      
      const data = await response.json();
      
      // First try with original home/away designation
      let matchingGame = findMatchingGame(data.events, game.away_team, game.home_team);
      let teamsSwapped = false;
      
      // If no match found, try with swapped teams
      if (!matchingGame) {
        console.log('No match found with original home/away, trying swapped teams');
        matchingGame = findMatchingGame(data.events, game.home_team, game.away_team);
        if (matchingGame) {
          teamsSwapped = true;
          console.log('Match found with swapped teams');
        }
      }
      
      if (!matchingGame) return null;
      
      // Get venue details
      const venueInfo = await getVenueDetails(sportLeague.sport, mappedLeague, matchingGame.id);
      
      // If we needed to swap teams, the odds API's home/away designation was incorrect
      // Add the correct teams to the venue info
      if (venueInfo && teamsSwapped) {
        // Get the correct teams from ESPN
        const competitors = matchingGame.competitions?.[0]?.competitors || [];
        const espnHome = competitors.find(c => c.homeAway === 'home')?.team;
        const espnAway = competitors.find(c => c.homeAway === 'away')?.team;
        
        if (espnHome && espnAway) {
          console.log(`Correcting home/away: ESPN has ${espnHome.displayName} (HOME) vs ${espnAway.displayName} (AWAY)`);
          console.log(`Odds API had ${game.home_team} (HOME) vs ${game.away_team} (AWAY)`);
          
          // Add the correct designations to the venue info
          venueInfo.correctedHomeTeam = espnHome.displayName;
          venueInfo.correctedAwayTeam = espnAway.displayName;
        }
      }
      
      return venueInfo;
    } catch (error) {
      console.error(`ESPN API request failed for ${sportLeague.sport}/${mappedLeague}:`, error);
      return null;
    }
  } catch (error) {
    console.error('ESPN venue lookup error:', error);
    return null;
  }
}

/**
 * Maps sport_key to ESPN's sport and league format
 */
function getSportAndLeague(sport_key: string): {sport: string, league: string} | null {
  // Extract league from sport_key format (e.g., "basketball_nba" → "basketball", "nba")
  const parts = sport_key.split('_');
  if (parts.length < 2) return null;
  
  const sport = parts[0];
  const league = parts[1];
  
  // Map to ESPN's naming conventions
  const sportMap: {[key: string]: string} = {
    'americanfootball': 'football',
    'icehockey': 'hockey'
  };
  
  return {
    sport: sportMap[sport] || sport,
    league: league
  };
}

/**
 * Enhanced matching algorithm for finding games
 * Tries both "away @ home" combinations 
 */
function findMatchingGame(events: ESPNEvent[], awayTeam: string, homeTeam: string): ESPNEvent | null {
  if (!events || !Array.isArray(events) || events.length === 0) return null;
  
  // Clean team names
  const cleanName = (name: string): string => {
    return name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  };
  
  const cleanAway = cleanName(awayTeam);
  const cleanHome = cleanName(homeTeam);
  
  console.log(`Looking for match: ${cleanAway} @ ${cleanHome}`);
  
  // Calculate Levenshtein distance between strings
  const levenshteinDistance = (a: string, b: string): number => {
    if (!a || !b) return 999;
    
    const matrix = Array(a.length + 1).fill(null).map(() => Array(b.length + 1).fill(null));
    
    for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
    
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // deletion
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }
    
    return matrix[a.length][b.length];
  };
  
  // Calculate similarity score (lower is better)
  const getSimilarityScore = (espnTeam: string, ourTeam: string): number => {
    // For multi-word team names, try different word combinations
    const espnWords = espnTeam.split(' ');
    const ourWords = ourTeam.split(' ');
    
    // If one of the teams has 3+ words, consider all possible combinations
    if (ourWords.length >= 3) {
      const lastTwo = ourWords.slice(-2).join(' ');
      const firstTwo = ourWords.slice(0, 2).join(' ');
      
      // Check if the two-word segments match exactly
      if (espnTeam.includes(lastTwo)) return 0;
      if (espnTeam.includes(firstTwo)) return 1;
    }
    
    // For NHL teams with city+name format (e.g., "Tampa Bay Lightning")
    if (ourWords.length >= 2 && espnWords.length >= 2) {
      // Compare last words (usually the team nickname)
      const espnLastWord = espnWords[espnWords.length - 1];
      const ourLastWord = ourWords[ourWords.length - 1];
      
      if (espnLastWord === ourLastWord) return 2;
    }
    
    // Fall back to Levenshtein distance
    return levenshteinDistance(espnTeam, ourTeam);
  };
  
  // Score all events and find the best match
  const scoredEvents: ScoredMatch[] = events.map(event => {
    const competitors = event.competitions?.[0]?.competitors || [];
    if (competitors.length < 2) return { event, score: 999 };
    
    const espnHome = competitors.find(c => c.homeAway === 'home')?.team;
    const espnAway = competitors.find(c => c.homeAway === 'away')?.team;
    
    if (!espnHome || !espnAway) return { event, score: 999 };
    
    const espnHomeName = cleanName(espnHome.displayName);
    const espnAwayName = cleanName(espnAway.displayName);
    
    // Calculate similarity scores
    const homeScore = getSimilarityScore(espnHomeName, cleanHome);
    const awayScore = getSimilarityScore(espnAwayName, cleanAway);
    
    // Combined score (lower is better)
    const totalScore = homeScore + awayScore;
    
    return {
      event,
      score: totalScore,
      homeTeam: espnHomeName,
      awayTeam: espnAwayName
    };
  });
  
  // Sort by score (lowest is best)
  scoredEvents.sort((a, b) => a.score - b.score);
  
  // Log top matches for debugging
  const topMatches = scoredEvents.slice(0, 3);
  console.log('Top matches:');
  topMatches.forEach((match, i) => {
    console.log(`${i+1}. Score: ${match.score}, Teams: ${match.awayTeam} @ ${match.homeTeam}`);
  });
  
  // Return best match if it's good enough (score less than threshold)
  const threshold = 5; // Adjust if needed
  if (scoredEvents.length > 0 && scoredEvents[0].score <= threshold) {
    console.log(`✓ Best match found: ${scoredEvents[0].event.name} (score: ${scoredEvents[0].score})`);
    return scoredEvents[0].event;
  }
  
  console.log('✗ No suitable match found');
  return null;
}

/**
 * Gets detailed venue information for a specific ESPN game
 */
async function getVenueDetails(sport: string, league: string, gameId: string): Promise<VenueInfo | null> {
  try {
    const url = `http://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/summary?event=${gameId}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`ESPN venue details API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    // Try multiple paths to find venue information
    let venue = null;
    
    // Check gameInfo.venue first (most detailed)
    if (data.gameInfo?.venue) {
      venue = data.gameInfo.venue;
    } 
    // Check header.competitions[0].venue next
    else if (data.header?.competitions?.[0]?.venue) {
      venue = data.header.competitions[0].venue;
    }
    // Try competitions[0].venue as another fallback
    else if (data.competitions?.[0]?.venue) {
      venue = data.competitions[0].venue;
    }
    
    if (!venue) return null;
    
    return {
      venue: venue.fullName || '',
      city: venue.address?.city || '',
      state: venue.address?.state || '',
      isNeutral: false
    };
  } catch (error) {
    console.error('Error fetching ESPN venue details:', error);
    return null;
  }
}

/**
 * Fetch event-specific venue information from sportsdb API
 */
async function fetchEventVenue(
  homeTeam: string, 
  awayTeam: string, 
  date?: string
): Promise<VenueInfo | null> {
  // Encode team names for URL
  const encodedHome = encodeURIComponent(homeTeam.replace(/\s+/g, '_'));
  const encodedAway = encodeURIComponent(awayTeam.replace(/\s+/g, '_'));
  
  let endpoint = `${API_BASE_URL}/searchevents.php?e=${encodedHome}_vs_${encodedAway}`;
  
  // Add season parameter if date is provided
  if (date) {
    const year = new Date(date).getFullYear();
    endpoint += `&s=${year}-${year+1}`;
  }
  
  try {
    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`Error fetching event: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Check if event data exists and has venue info
    if (data.event && data.event.length > 0) {
      const event = data.event[0];
      
      if (event.strVenue) {
        return {
          venue: event.strVenue,
          city: event.strCity || undefined,
          state: event.strState || undefined,
          isNeutral: event.strHomeTeam !== homeTeam
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching event venue:', error);
    return null;
  }
}

/**
 * Fetch a team's default venue
 */
async function fetchTeamVenue(teamName: string): Promise<VenueInfo | null> {
  const encodedTeam = encodeURIComponent(teamName.replace(/\s+/g, '_'));
  const endpoint = `${API_BASE_URL}/searchteams.php?t=${encodedTeam}`;
  
  try {
    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`Error fetching team: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.teams && data.teams.length > 0) {
      const team = data.teams[0];
      
      if (team.strStadium) {
        return {
          venue: team.strStadium,
          city: team.strStadiumLocation?.split(',')[0] || undefined,
          state: team.strStadiumLocation?.split(',')[1]?.trim() || undefined,
          isNeutral: false
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching team venue:', error);
    return null;
  }
}

/**
 * Get venue from cache if available and not expired
 */
function getVenueFromCache(key: string): VenueInfo | null {
  try {
    const cachedData = localStorage.getItem(CACHE_KEY);
    if (!cachedData) return null;
    
    const venueCache: CachedVenueData = JSON.parse(cachedData);
    const now = Date.now();
    
    // Check if cache is still valid
    if (now - venueCache.timestamp < CACHE_DURATION_MS) {
      return venueCache.venues[key] || null;
    }
    
    return null;
  } catch (error) {
    console.warn('Error accessing venue cache:', error);
    return null;
  }
}

/**
 * Save venue info to cache
 */
function saveVenueToCache(key: string, venue: VenueInfo): void {
  try {
    let venueCache: CachedVenueData;
    const cachedData = localStorage.getItem(CACHE_KEY);
    
    if (cachedData) {
      venueCache = JSON.parse(cachedData);
      // Reset timestamp if cache is too old
      if (Date.now() - venueCache.timestamp > CACHE_DURATION_MS) {
        venueCache = { venues: {}, timestamp: Date.now() };
      }
    } else {
      venueCache = { venues: {}, timestamp: Date.now() };
    }
    
    // Add/update the venue info
    venueCache.venues[key] = venue;
    
    // Save back to localStorage
    localStorage.setItem(CACHE_KEY, JSON.stringify(venueCache));
  } catch (error) {
    console.warn('Error saving venue to cache:', error);
  }
}

/**
 * Clear the venue cache
 */
export function clearVenueCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (error) {
    console.warn('Error clearing venue cache:', error);
  }
}

/**
 * Refresh venue data for all games in cache
 */
export async function refreshVenueData(): Promise<boolean> {
  clearVenueCache(); // Always clear cache on refresh
  return true;
}