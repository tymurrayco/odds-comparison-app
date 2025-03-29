// src/lib/api.ts
export type League = {
  id: string;
  name: string;
  logo: string;
};

export type Game = {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers: Bookmaker[];
};

export type Bookmaker = {
  title: string;
  markets: Market[];
};

export type Market = {
  key: string;
  outcomes: Outcome[];
};

export type Outcome = {
  name: string;
  price: number;
  point?: number;
};

export type FuturesMarket = {
  title: string;
  teams: FuturesTeam[];
};

export type FuturesTeam = {
  team: string;
  odds: Record<string, number>;
};

export type BookmakerInfo = {
  title: string;
  logo: string;
};

export const LEAGUES: League[] = [
  { id: 'basketball_nba', name: 'NBA', logo: '/logos/nba.svg' },
  { id: 'americanfootball_nfl', name: 'NFL', logo: '/logos/nfl.svg' },
  { id: 'basketball_ncaab', name: 'NCAAB', logo: '/logos/ncaab.svg' },
  { id: 'americanfootball_ncaaf', name: 'NCAAF', logo: '/logos/ncaaf.svg' },
  { id: 'baseball_mlb', name: 'MLB', logo: '/logos/mlb.svg' },
  { id: 'icehockey_nhl', name: 'NHL', logo: '/logos/nhl.svg' },
  { id: 'soccer_epl', name: 'Premier League', logo: '/logos/epl.svg' },
  { id: 'golf_masters_tournament_winner', name: 'The Masters', logo: '/logos/masters.svg' },
];

export const BOOKMAKERS = ['DraftKings', 'FanDuel', 'BetMGM', 'Caesars'];

export const BOOKMAKER_INFO: BookmakerInfo[] = [
  { title: 'DraftKings', logo: '/bookmaker-logos/draftkings.png' },
  { title: 'FanDuel', logo: '/bookmaker-logos/fd.png' },
  { title: 'BetMGM', logo: '/bookmaker-logos/betmgm.png' },
  { title: 'Caesars', logo: '/bookmaker-logos/caesars.png' },
];

export async function fetchOdds(sportKey: string): Promise<Game[]> {
  try {
    console.log(`Fetching odds for sport: ${sportKey}`);
    const response = await fetch(`/api/odds?sport=${sportKey}`, {
      cache: 'no-store'
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error response: ${response.status} - ${errorText}`);
      return []; // Return empty array instead of throwing
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching odds:', error);
    return []; // Return empty array on error
  }
}

export async function fetchFutures(sportKey: string): Promise<FuturesMarket[]> {
  try {
    console.log(`Fetching futures for sport: ${sportKey}`);
    const response = await fetch(`/api/futures?sport=${sportKey}`, {
      cache: 'no-store'
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error response: ${response.status} - ${errorText}`);
      return []; // Return empty array instead of throwing
    }
    
    // Raw data from the API
    const rawData = await response.json();
    
    // Transform the raw API data into the expected format
    if (!Array.isArray(rawData) || rawData.length === 0) {
      return [];
    }
    
    // Group by market title (usually there's just one market type - outrights)
    const marketsByTitle = {};
    
    rawData.forEach(item => {
      item.bookmakers.forEach(bookmaker => {
        bookmaker.markets.forEach(market => {
          if (!marketsByTitle[market.key]) {
            marketsByTitle[market.key] = {
              title: market.key,
              teams: []
            };
          }
          
          market.outcomes.forEach(outcome => {
            // Find existing team or create new one
            let team = marketsByTitle[market.key].teams.find(t => t.team === outcome.name);
            if (!team) {
              team = { team: outcome.name, odds: {} };
              marketsByTitle[market.key].teams.push(team);
            }
            
            // Add the odds for this bookmaker
            team.odds[bookmaker.title] = outcome.price;
          });
        });
      });
    });
    
    return Object.values(marketsByTitle);
  } catch (error) {
    console.error('Error fetching futures:', error);
    return []; // Return empty array on error
  }
}