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
  link?: string; // Deep link to event page on sportsbook
  markets: Market[];
}

export interface Market {
  key: string;
  last_update: string;
  link?: string; // Deep link to market on sportsbook
  outcomes: Outcome[];
}

export interface Outcome {
  name: string;
  price: number;
  point?: number;
  description?: string; // For props - e.g., "Over" or "Under"
  link?: string; // Deep link to add this bet to betslip
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

// Props types
export interface PropsEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
}

export interface PropOutcome {
  name: string; // "Over" or "Under"
  description: string; // Player name (e.g., "Anthony Davis")
  price: number;
  point: number; // The line (e.g., 24.5 points)
}

export interface PropMarket {
  key: string; // e.g., "player_points"
  last_update: string;
  outcomes: PropOutcome[];
}

export interface PropsBookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: PropMarket[];
}

export interface PropsData {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: PropsBookmaker[];
}

// Processed props for display
export interface ProcessedProp {
  playerName: string;
  marketKey: string;
  marketName: string;
  line: number; // Default/display line (may vary by book)
  odds: {
    [bookmaker: string]: {
      over: number | null;
      under: number | null;
      line?: number; // Line specific to this bookmaker
    };
  };
}

export interface ProcessedPropsMarket {
  marketKey: string;
  marketName: string;
  props: ProcessedProp[];
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
export const BOOKMAKERS = ['DraftKings', 'FanDuel', 'BetMGM', 'BetRivers', 'Caesars', 'BetOnline.ag'];

// List of leagues with isActive flag
export const LEAGUES = [
  { id: 'baseball_mlb', name: 'MLB', icon: '/league-icons/mlb.png', isActive: false },
  { id: 'americanfootball_nfl', name: 'NFL', icon: '/league-icons/nfl.png', isActive: true },
  { id: 'americanfootball_nfl_preseason', name: 'NFL PreSzn', icon: '/league-icons/nfl.png', isActive: false },
  { id: 'americanfootball_ncaaf', name: 'NCAAF', icon: '/league-icons/ncaaf.png', isActive: true },
  { id: 'basketball_ncaab', name: 'NCAAB', icon: '/league-icons/ncaab.png', isActive: true },
  { id: 'soccer_epl', name: 'EPL', icon: '/league-icons/epl.png', isActive: true },
  { id: 'soccer_usa_mls', name: 'MLS', icon: '/league-icons/mls.png', isActive: false },
  { id: 'basketball_wnba', name: 'WNBA', icon: '/league-icons/wnba.png', isActive: false },
  { id: 'icehockey_nhl', name: 'NHL', icon: '/league-icons/nhl.png', isActive: true },
  { id: 'basketball_nba', name: 'NBA', icon: '/league-icons/nba.png', isActive: true },
  { id: 'baseball_ncaa', name: 'CWS', icon: '/league-icons/cws.png', isActive: false }, // Hidden - out of season
  { id: 'lacrosse_ncaa', name: 'NCAAL', icon: '/league-icons/ncaal.png', isActive: false }, // Hidden - out of season
];

// Leagues that support props
export const PROPS_SUPPORTED_LEAGUES = [
  'basketball_nba',
  'americanfootball_nfl',
  'americanfootball_ncaaf',
  'icehockey_nhl',
  'baseball_mlb',
  'basketball_ncaab'
];

// Human-readable names for prop markets
export const PROP_MARKET_NAMES: { [key: string]: string } = {
  // Basketball
  'player_points': 'Points',
  'player_rebounds': 'Rebounds',
  'player_assists': 'Assists',
  'player_threes': '3-Pointers Made',
  'player_points_rebounds_assists': 'Pts + Reb + Ast',
  'player_points_rebounds': 'Pts + Reb',
  'player_points_assists': 'Pts + Ast',
  'player_rebounds_assists': 'Reb + Ast',
  'player_steals': 'Steals',
  'player_blocks': 'Blocks',
  'player_turnovers': 'Turnovers',
  'player_double_double': 'Double Double',
  'player_triple_double': 'Triple Double',
  // Football
  'player_pass_tds': 'Pass TDs',
  'player_pass_yds': 'Pass Yards',
  'player_pass_completions': 'Completions',
  'player_pass_attempts': 'Pass Attempts',
  'player_pass_interceptions': 'Interceptions Thrown',
  'player_rush_yds': 'Rush Yards',
  'player_rush_attempts': 'Rush Attempts',
  'player_rush_longest': 'Longest Rush',
  'player_receptions': 'Receptions',
  'player_reception_yds': 'Receiving Yards',
  'player_reception_longest': 'Longest Reception',
  'player_kicking_points': 'Kicking Points',
  'player_field_goals': 'Field Goals Made',
  'player_tackles_assists': 'Tackles + Assists',
  'player_anytime_td': 'Anytime TD Scorer',
  // Hockey
  'player_power_play_points': 'Power Play Points',
  'player_blocked_shots': 'Blocked Shots',
  'player_shots_on_goal': 'Shots on Goal',
  'player_goals': 'Goals',
  'player_total_saves': 'Saves (Goalie)',
  // Baseball
  'batter_home_runs': 'Home Runs',
  'batter_hits': 'Hits',
  'batter_total_bases': 'Total Bases',
  'batter_rbis': 'RBIs',
  'batter_runs_scored': 'Runs Scored',
  'batter_hits_runs_rbis': 'Hits + Runs + RBIs',
  'batter_singles': 'Singles',
  'batter_doubles': 'Doubles',
  'batter_triples': 'Triples',
  'batter_walks': 'Walks',
  'batter_strikeouts': 'Strikeouts',
  'batter_stolen_bases': 'Stolen Bases',
  'pitcher_strikeouts': 'Pitcher Strikeouts',
  'pitcher_hits_allowed': 'Hits Allowed',
  'pitcher_walks': 'Pitcher Walks',
  'pitcher_earned_runs': 'Earned Runs',
  'pitcher_outs': 'Outs Recorded'
};

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
    
    return {
      data: data,
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
 * Fetch list of events available for props
 * 
 * @param sport - The sport key, e.g. 'basketball_nba'
 * @returns Object with array of events and API requests remaining
 */
export async function fetchPropsEvents(sport: string): Promise<ApiResponse<PropsEvent[]>> {
  try {
    const response = await fetch(`/api/props?sport=${sport}`);
    if (!response.ok) {
      throw new Error(`Error fetching props events: ${response.statusText}`);
    }
    const data = await response.json();
    const requestsRemaining = response.headers.get('x-requests-remaining');
    
    return {
      data: data,
      requestsRemaining
    };
  } catch (error) {
    console.error('Error fetching props events:', error);
    return {
      data: [],
      requestsRemaining: null
    };
  }
}

/**
 * Fetch player props for a specific event
 * 
 * @param sport - The sport key, e.g. 'basketball_nba'
 * @param eventId - The event ID to fetch props for
 * @returns Object with processed props data and API requests remaining
 */
export async function fetchProps(sport: string, eventId: string): Promise<ApiResponse<ProcessedPropsMarket[]>> {
  try {
    const response = await fetch(`/api/props?sport=${sport}&eventId=${eventId}`);
    if (!response.ok) {
      throw new Error(`Error fetching props: ${response.statusText}`);
    }
    const rawData: PropsData = await response.json();
    const requestsRemaining = response.headers.get('x-requests-remaining');
    
    // Process the raw data into a more usable format
    // Group by market type (e.g., player_points), then by player name
    const propsByMarket: { [marketKey: string]: { [playerName: string]: ProcessedProp } } = {};
    
    rawData.bookmakers?.forEach((bookmaker: PropsBookmaker) => {
      bookmaker.markets?.forEach((market: PropMarket) => {
        const marketKey = market.key;
        const marketName = PROP_MARKET_NAMES[marketKey] || marketKey;
        
        if (!propsByMarket[marketKey]) {
          propsByMarket[marketKey] = {};
        }
        
        market.outcomes?.forEach((outcome: PropOutcome) => {
          // In the API response:
          // - outcome.name = "Over" or "Under"
          // - outcome.description = player name (e.g., "Anthony Davis")
          const playerName = outcome.description;
          const overUnder = outcome.name;
          const line = outcome.point;
          
          if (!playerName || line === undefined || line === null) return;
          
          if (!propsByMarket[marketKey][playerName]) {
            propsByMarket[marketKey][playerName] = {
              playerName,
              marketKey,
              marketName,
              line: 0, // Will be set per-bookmaker
              odds: {}
            };
          }
          
          if (!propsByMarket[marketKey][playerName].odds[bookmaker.title]) {
            propsByMarket[marketKey][playerName].odds[bookmaker.title] = {
              over: null,
              under: null,
              line: line
            };
          }
          
          // Set over or under based on outcome.name
          if (overUnder?.toLowerCase() === 'over') {
            propsByMarket[marketKey][playerName].odds[bookmaker.title].over = outcome.price;
            propsByMarket[marketKey][playerName].odds[bookmaker.title].line = line;
          } else if (overUnder?.toLowerCase() === 'under') {
            propsByMarket[marketKey][playerName].odds[bookmaker.title].under = outcome.price;
            propsByMarket[marketKey][playerName].odds[bookmaker.title].line = line;
          }
        });
      });
    });
    
    // Convert to array format and sort
    const processedMarkets: ProcessedPropsMarket[] = Object.entries(propsByMarket).map(([marketKey, players]) => {
      const props = Object.values(players).sort((a, b) => {
        // Sort by player name
        return a.playerName.localeCompare(b.playerName);
      });
      
      return {
        marketKey,
        marketName: PROP_MARKET_NAMES[marketKey] || marketKey,
        props
      };
    });
    
    // Sort markets by a predefined order (most popular first)
    const marketOrder = [
      'player_points', 'player_rebounds', 'player_assists', 'player_threes',
      'player_points_rebounds_assists', 'player_pass_yds', 'player_rush_yds',
      'player_reception_yds', 'player_receptions', 'player_anytime_td',
      'batter_hits', 'batter_total_bases', 'pitcher_strikeouts',
      'player_goals', 'player_shots_on_goal', 'player_total_saves'
    ];
    
    processedMarkets.sort((a, b) => {
      const aIndex = marketOrder.indexOf(a.marketKey);
      const bIndex = marketOrder.indexOf(b.marketKey);
      if (aIndex === -1 && bIndex === -1) return a.marketKey.localeCompare(b.marketKey);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
    
    return {
      data: processedMarkets,
      requestsRemaining
    };
  } catch (error) {
    console.error('Error fetching props:', error);
    return {
      data: [],
      requestsRemaining: null
    };
  }
}

/**
 * Refresh all data
 * 
 * @param sport - The sport key to refresh
 * @returns Promise resolving to the refreshed data
 */
export async function refreshData(sport: string): Promise<ApiResponse<Game[]>> {
  // Fetch the latest odds
  return fetchOdds(sport);
}

// ESPN Live Scores types and functions
export interface ESPNGameScore {
  homeTeam: string;
  awayTeam: string;
  homeScore: string;
  awayScore: string;
  homeLogo: string;
  awayLogo: string;
  period: number;
  displayClock: string;
  state: 'pre' | 'in' | 'post';
  statusDetail: string;
}

// Team name matching utilities
// Get the mascot (last word) from team name
const getMascot = (name: string): string => {
  const words = name.trim().split(/\s+/);
  return words[words.length - 1].toLowerCase();
};

// Get city/location (all words except last) from team name
const getCity = (name: string): string => {
  const words = name.trim().split(/\s+/);
  if (words.length <= 1) return name.toLowerCase();
  return words.slice(0, -1).join(' ').toLowerCase();
};

// Get first word (often the school/city name)
const getFirstWord = (name: string): string => {
  const words = name.trim().split(/\s+/);
  return words[0].toLowerCase();
};

// Check if two team names likely refer to the same team
const teamsMatch = (name1: string, name2: string): boolean => {
  const n1 = name1.toLowerCase();
  const n2 = name2.toLowerCase();
  
  // Exact match
  if (n1 === n2) return true;
  
  // One contains the other
  if (n1.includes(n2) || n2.includes(n1)) return true;
  
  // Mascot match
  if (getMascot(name1) === getMascot(name2)) return true;
  
  // First word match (e.g., "Duke" vs "Duke Blue Devils")
  if (getFirstWord(name1) === getFirstWord(name2)) return true;
  
  // City match
  const city1 = getCity(name1);
  const city2 = getCity(name2);
  if (city1.length > 2 && city2.length > 2 && city1 === city2) return true;
  
  return false;
};

/**
 * Match an odds game to an ESPN game score
 */
export const matchGameToScore = (
  game: Game,
  scores: ESPNGameScore[]
): ESPNGameScore | null => {
  const gameTime = new Date(game.commence_time).getTime();
  const now = Date.now();
  
  // Only try to match games that have started or are within 3 hours of starting
  const threeHours = 3 * 60 * 60 * 1000;
  if (gameTime > now + threeHours) {
    return null;
  }

  for (const score of scores) {
    const homeMatch = teamsMatch(game.home_team, score.homeTeam);
    const awayMatch = teamsMatch(game.away_team, score.awayTeam);

    if (homeMatch && awayMatch) {
      return score;
    }
  }

  return null;
};

/**
 * Fetch live scores from ESPN
 */
export async function fetchESPNScores(league: string): Promise<ESPNGameScore[]> {
  try {
    const response = await fetch(`/api/espn?league=${league}`);
    
    if (!response.ok) {
      console.error('ESPN API error:', response.status);
      return [];
    }

    const data = await response.json();
    return data.scores || [];
  } catch (error) {
    console.error('Error fetching ESPN scores:', error);
    return [];
  }
}