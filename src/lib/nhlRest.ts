// src/lib/nhlRest.ts
// NHL Rest data types and fetch function

export interface TeamRestInfo {
  teamName: string;
  teamAbbr: string;
  restDays: number;
  isB2B: boolean;
  is3in4: boolean;
  is4in6: boolean;
  lastGameDate: string | null;
  gamesLast4Days: number;
  gamesLast6Days: number;
}

export interface GameRestData {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  homeRest: TeamRestInfo;
  awayRest: TeamRestInfo;
  restAdvantage: 'home' | 'away' | 'even';
  restAdvantageDays: number;
}

export interface NHLRestResponse {
  date: string;
  games: GameRestData[];
}

/**
 * Fetch NHL rest data for today's games
 */
export async function fetchNHLRestData(): Promise<GameRestData[]> {
  try {
    const response = await fetch('/api/nhl-rest');
    
    if (!response.ok) {
      console.error('NHL Rest API error:', response.status);
      return [];
    }

    const data: NHLRestResponse = await response.json();
    return data.games || [];
  } catch (error) {
    console.error('Error fetching NHL rest data:', error);
    return [];
  }
}

/**
 * Match a game to its rest data
 * Uses team name matching to find the correct rest data for a game
 */
export function matchGameToRestData(
  gameHomeTeam: string,
  gameAwayTeam: string,
  restDataList: GameRestData[]
): GameRestData | null {
  // Helper to check if team names match
  const teamsMatch = (name1: string, name2: string): boolean => {
    const n1 = name1.toLowerCase();
    const n2 = name2.toLowerCase();
    
    // Exact match
    if (n1 === n2) return true;
    
    // One contains the other
    if (n1.includes(n2) || n2.includes(n1)) return true;
    
    // Mascot match (last word)
    const getMascot = (name: string): string => {
      const words = name.trim().split(/\s+/);
      return words[words.length - 1].toLowerCase();
    };
    if (getMascot(name1) === getMascot(name2)) return true;
    
    // City match (first word)
    const getCity = (name: string): string => {
      const words = name.trim().split(/\s+/);
      return words[0].toLowerCase();
    };
    if (getCity(name1) === getCity(name2)) return true;
    
    return false;
  };

  for (const restData of restDataList) {
    const homeMatch = teamsMatch(gameHomeTeam, restData.homeTeam);
    const awayMatch = teamsMatch(gameAwayTeam, restData.awayTeam);

    if (homeMatch && awayMatch) {
      return restData;
    }
  }

  return null;
}
