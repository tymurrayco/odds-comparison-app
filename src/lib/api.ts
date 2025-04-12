// src/lib/api.ts

// Define the types we need
export interface Game {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Bookmaker[];
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

// List of supported bookmakers
export const BOOKMAKERS = ['DraftKings', 'FanDuel', 'BetMGM', 'BetRivers'];

// List of leagues
export const LEAGUES = [
  { id: 'basketball_nba', name: 'NBA', icon: '/league-icons/nba.png' },
  { id: 'americanfootball_nfl', name: 'NFL', icon: '/league-icons/nfl.png' },
  { id: 'baseball_mlb', name: 'MLB', icon: '/league-icons/mlb.png' },
  { id: 'icehockey_nhl', name: 'NHL', icon: '/league-icons/nhl.png' },
  { id: 'basketball_ncaab', name: 'NCAAB', icon: '/league-icons/ncaab.png' },
  { id: 'americanfootball_ncaaf', name: 'NCAAF', icon: '/league-icons/ncaaf.png' },
  { id: 'soccer_epl', name: 'EPL', icon: '/league-icons/epl.png' },
  { id: 'golf_masters_tournament_winner', name: 'Masters', icon: '/league-icons/masters.png' },
];

/**
 * Fetch sports odds for a specific sport
 * 
 * @param sport - The sport key, e.g. 'basketball_nba'
 * @returns Array of game objects with odds from various bookmakers
 */
export async function fetchOdds(sport: string): Promise<Game[]> {
  try {
    const response = await fetch(`/api/odds?sport=${sport}`);
    if (!response.ok) {
      throw new Error(`Error fetching odds: ${response.statusText}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching odds:', error);
    return [];
  }
}

/**
 * Fetch futures odds for a specific sport
 * 
 * @param sport - The sport key, e.g. 'basketball_nba'
 * @returns Array of futures market objects
 */
export async function fetchFutures(sport: string): Promise<FuturesMarket[]> {
  try {
    const response = await fetch(`/api/futures?sport=${sport}`);
    if (!response.ok) {
      throw new Error(`Error fetching futures: ${response.statusText}`);
    }
    const rawData = await response.json();
    
    // Process the raw data into a more usable format
    // We want to group by market (e.g. "Championship Winner") and then by team
    const marketsByTitle: { [key: string]: FuturesMarket } = {};
    
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
    
    return markets;
  } catch (error) {
    console.error('Error fetching futures:', error);
    return [];
  }
}