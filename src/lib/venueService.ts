// src/lib/venueService.ts

/**
 * Interfaces for venue data
 */
export interface VenueInfo {
    venue: string;        // Name of the venue/stadium
    isNeutral?: boolean;  // Whether it's a neutral site game
  }
  
  interface CachedVenueData {
    venues: { [key: string]: VenueInfo };
    timestamp: number;
  }
  
  /**
   * Constants
   */
  const CACHE_KEY = 'sports_odds_venue_cache';
  const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
  const API_BASE_URL = 'https://www.thesportsdb.com/api/v1/json/3';
  
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
      // Try to get event-specific venue first
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
   * Fetch event-specific venue information
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
            isNeutral: event.strHomeTeam !== homeTeam // Check if neutral site
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