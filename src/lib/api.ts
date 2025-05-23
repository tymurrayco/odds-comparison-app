// src/lib/api.ts

// Import the venue service
import { getVenueForGame, getVenueFromESPN } from './venueService';

// Define the types we need
export interface Game {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Bookmaker[];
  location?: string; // Venue location
  corrected_home_away?: boolean; // Flag indicating if home/away were swapped
}

export interface Bookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: Market[];
}

export interface Market {
  key: string;
  last_update: string;
  outcomes: Outcome[];
}

export interface Outcome {
  name: string;
  price: number;
  point?: number;
}

export interface FuturesMarket {
  id: string;
  title: string;
  teams: FuturesTeam[];
}

export interface FuturesTeam {
  team: string;
  odds: { [bookmaker: string]: number };
}

// Define the RawGameData interface for the raw data
interface RawGameData {
  id: string;
  bookmakers: Bookmaker[];
}

// Define the ApiResponse interface for responses that include rate limit info
export interface ApiResponse<T> {
  data: T;
  requestsRemaining: string | null;
}

// List of supported bookmakers
export const BOOKMAKERS = ['DraftKings', 'FanDuel', 'BetMGM', 'BetRivers'];

// List of leagues
export const LEAGUES = [
  { id: 'basketball_nba', name: 'NBA', icon: '/league-icons/nba.png' },
  { id: 'americanfootball_nfl', name: 'NFL', icon: '/league-icons/nfl.png' },
  { id: 'baseball_mlb', name: 'MLB', icon: '/league-icons/mlb.png' },
  { id: 'icehockey_nhl', name: 'NHL', icon: '/league-icons/nhl.png' },
  { id: 'baseball_ncaa', name: 'CWS', icon: '/league-icons/cws.png' },
  { id: 'americanfootball_ncaaf', name: 'NCAAF', icon: '/league-icons/ncaaf.png' },
  { id: 'soccer_epl', name: 'EPL', icon: '/league-icons/epl.png' },
  { id: 'lacrosse_ncaa', name: 'NCAAL', icon: '/league-icons/ncaal.png' }, 
];

/**
 * Fetch sports odds for a specific sport
 * 
 * @param sport - The sport key, e.g. 'basketball_nba'
 * @returns Object with array of game objects and API requests remaining
 */
export async function fetchOdds(sport: string): Promise<ApiResponse<Game[]>> {
  try {
    const response = await fetch(`/api/odds?sport=${sport}`);
    if (!response.ok) {
      throw new Error(`Error fetching odds: ${response.statusText}`);
    }
    const data = await response.json();
    const requestsRemaining = response.headers.get('x-requests-remaining');
    
    // Log a sample game to debug home/away designations
    if (data.length > 0) {
      console.log('Sample game from odds API:', {
        home: data[0].home_team,
        away: data[0].away_team
      });
    }
    
    // Try to use ESPN API first for venue and home/away correction
    const gamesWithVenues = await Promise.all(data.map(async (game: Game) => {
      // Extract date from commence_time for more accurate event lookup
      const gameDate = new Date(game.commence_time).toISOString().split('T')[0];
      
      // First try ESPN API (which will also verify home/away teams)
      const espnVenueInfo = await getVenueFromESPN(game);
      
      if (espnVenueInfo) {
        // Check if teams were corrected
        if (espnVenueInfo.correctedHomeTeam && espnVenueInfo.correctedAwayTeam) {
          // Teams were swapped - odds API had it backwards
          console.log(`Correcting home/away teams for ${game.home_team} vs ${game.away_team}`);
          
          // Create corrected game object
          return {
            ...game,
            location: espnVenueInfo.venue + (espnVenueInfo.city && espnVenueInfo.state 
              ? ` - ${espnVenueInfo.city}, ${espnVenueInfo.state}` 
              : (espnVenueInfo.city || espnVenueInfo.state ? ` - ${espnVenueInfo.city || espnVenueInfo.state}` : '')),
            // Set these fields so GameCard can use them if needed
            home_team: espnVenueInfo.correctedHomeTeam,
            away_team: espnVenueInfo.correctedAwayTeam,
            corrected_home_away: true
          };
        } else {
          // Teams were correct, just add venue info
          return {
            ...game,
            location: espnVenueInfo.venue + (espnVenueInfo.city && espnVenueInfo.state 
              ? ` - ${espnVenueInfo.city}, ${espnVenueInfo.state}` 
              : (espnVenueInfo.city || espnVenueInfo.state ? ` - ${espnVenueInfo.city || espnVenueInfo.state}` : '')),
            corrected_home_away: false
          };
        }
      }
      
      // Fall back to original venue service if ESPN doesn't have data
      const venueInfo = await getVenueForGame(game.home_team, game.away_team, gameDate);
      
      return {
        ...game,
        location: venueInfo ? venueInfo.venue : '',
        corrected_home_away: false
      };
    }));
    
    return {
      data: gamesWithVenues,
      requestsRemaining
    };
  } catch (error) {
    console.error('Error fetching odds:', error);
    return {
      data: [],
      requestsRemaining: null
    };
  }
}

/**
 * Fetch futures odds for a specific sport
 * 
 * @param sport - The sport key, e.g. 'basketball_nba'
 * @returns Object with array of futures market objects and API requests remaining
 */
export async function fetchFutures(sport: string): Promise<ApiResponse<FuturesMarket[]>> {
  try {
    const response = await fetch(`/api/futures?sport=${sport}`);
    if (!response.ok) {
      throw new Error(`Error fetching futures: ${response.statusText}`);
    }
    const rawData = await response.json();
    const requestsRemaining = response.headers.get('x-requests-remaining');
    
    // Process the raw data into a more usable format
    // We want to group by market (e.g. "Championship Winner") and then by team
    const marketsByTitle: { [key: string]: FuturesMarket } = {};
    
    // Fix the 'any' type by using our RawGameData interface
    rawData.forEach((item: RawGameData) => {
      item.bookmakers.forEach((bookmaker: Bookmaker) => {
        bookmaker.markets.forEach((market: Market) => {
          if (!marketsByTitle[market.key]) {
            marketsByTitle[market.key] = {
              id: `${item.id}-${market.key}`,
              title: market.key,
              teams: []
            };
          }
          
          // Process each outcome (team)
          market.outcomes.forEach((outcome: Outcome) => {
            // Find or create team entry
            let teamEntry = marketsByTitle[market.key].teams.find(t => t.team === outcome.name);
            if (!teamEntry) {
              teamEntry = {
                team: outcome.name,
                odds: {}
              };
              marketsByTitle[market.key].teams.push(teamEntry);
            }
            
            // Add the odds from this bookmaker
            teamEntry.odds[bookmaker.title] = outcome.price;
          });
        });
      });
    });
    
    // Convert the object to an array and sort teams by likelihood to win (most likely first)
    const markets = Object.values(marketsByTitle);
    
    // Sort teams by implied probability (most likely first)
    markets.forEach(market => {
      market.teams.sort((a, b) => {
        // Calculate implied probability for each team based on American odds
        const calcImpliedProbability = (odds: number): number => {
          if (odds > 0) {
            // For positive odds: 100 / (odds + 100)
            return 100 / (odds + 100);
          } else {
            // For negative odds: |odds| / (|odds| + 100)
            return Math.abs(odds) / (Math.abs(odds) + 100);
          }
        };
        
        // Get best odds (lowest positive or highest negative) for each team
        const getImpliedProbability = (team: FuturesTeam): number => {
          const odds = Object.values(team.odds).filter(o => !isNaN(o));
          if (odds.length === 0) return 0;
          
          // Calculate implied probability for each bookmaker and take the highest
          return Math.max(...odds.map(calcImpliedProbability));
        };
        
        const probA = getImpliedProbability(a);
        const probB = getImpliedProbability(b);
        
        // Sort by highest probability first
        return probB - probA;
      });
    });
    
    return {
      data: markets,
      requestsRemaining
    };
  } catch (error) {
    console.error('Error fetching futures:', error);
    return {
      data: [],
      requestsRemaining: null
    };
  }
}

/**
 * Refresh all data including venue information
 * 
 * @param sport - The sport key to refresh
 * @returns Promise resolving to the refreshed data
 */
export async function refreshData(sport: string): Promise<ApiResponse<Game[]>> {
  // Then fetch the latest odds with venues
  return fetchOdds(sport);
}