// src/app/api/nhl-rest/route.ts
import { NextResponse } from 'next/server';

// Types for our rest data
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
  gameDate: string;
  homeTeam: string;
  awayTeam: string;
  homeRest: TeamRestInfo;
  awayRest: TeamRestInfo;
  restAdvantage: 'home' | 'away' | 'even';
  restAdvantageDays: number;
}

// ESPN team abbreviation mapping
const ESPN_TEAM_ABBR: { [key: string]: string } = {
  'Anaheim Ducks': 'ANA',
  'Arizona Coyotes': 'ARI',
  'Boston Bruins': 'BOS',
  'Buffalo Sabres': 'BUF',
  'Calgary Flames': 'CGY',
  'Carolina Hurricanes': 'CAR',
  'Chicago Blackhawks': 'CHI',
  'Colorado Avalanche': 'COL',
  'Columbus Blue Jackets': 'CBJ',
  'Dallas Stars': 'DAL',
  'Detroit Red Wings': 'DET',
  'Edmonton Oilers': 'EDM',
  'Florida Panthers': 'FLA',
  'Los Angeles Kings': 'LA',
  'Minnesota Wild': 'MIN',
  'Montreal Canadiens': 'MTL',
  'Nashville Predators': 'NSH',
  'New Jersey Devils': 'NJ',
  'New York Islanders': 'NYI',
  'New York Rangers': 'NYR',
  'Ottawa Senators': 'OTT',
  'Philadelphia Flyers': 'PHI',
  'Pittsburgh Penguins': 'PIT',
  'San Jose Sharks': 'SJ',
  'Seattle Kraken': 'SEA',
  'St. Louis Blues': 'STL',
  'St Louis Blues': 'STL',
  'Tampa Bay Lightning': 'TB',
  'Toronto Maple Leafs': 'TOR',
  'Utah Hockey Club': 'UTA',
  'Vancouver Canucks': 'VAN',
  'Vegas Golden Knights': 'VGK',
  'Washington Capitals': 'WSH',
  'Winnipeg Jets': 'WPG',
};

// Helper to get team abbreviation
function getTeamAbbr(teamName: string): string {
  return ESPN_TEAM_ABBR[teamName] || teamName.substring(0, 3).toUpperCase();
}

// Helper to format date for ESPN API (YYYYMMDD)
function formatDateForESPN(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

// Helper to get date string for comparison (YYYY-MM-DD)
function getDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Helper to calculate days between two dates
function daysBetween(date1: Date, date2: Date): number {
  const oneDay = 24 * 60 * 60 * 1000;
  // Reset times to midnight for accurate day calculation
  const d1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
  const d2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
  return Math.round(Math.abs((d2.getTime() - d1.getTime()) / oneDay));
}

// Fetch games for a specific date from ESPN
async function fetchGamesForDate(date: Date): Promise<{ homeTeam: string; awayTeam: string; date: string }[]> {
  const dateStr = formatDateForESPN(date);
  const apiUrl = `https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates=${dateStr}`;
  
  try {
    const response = await fetch(apiUrl, { next: { revalidate: 300 } }); // Cache for 5 minutes
    if (!response.ok) {
      console.error(`ESPN API error for date ${dateStr}:`, response.status);
      return [];
    }
    
    const data = await response.json();
    const games: { homeTeam: string; awayTeam: string; date: string }[] = [];
    
    if (data.events && Array.isArray(data.events)) {
      for (const event of data.events) {
        const competition = event.competitions?.[0];
        if (!competition) continue;
        
        const competitors = competition.competitors || [];
        const homeTeam = competitors.find((c: { homeAway: string }) => c.homeAway === 'home');
        const awayTeam = competitors.find((c: { homeAway: string }) => c.homeAway === 'away');
        
        if (homeTeam?.team?.displayName && awayTeam?.team?.displayName) {
          games.push({
            homeTeam: homeTeam.team.displayName,
            awayTeam: awayTeam.team.displayName,
            date: getDateString(date),
          });
        }
      }
    }
    
    return games;
  } catch (error) {
    console.error(`Error fetching games for date ${dateStr}:`, error);
    return [];
  }
}

export async function GET() {
  try {
    const today = new Date();
    const todayStr = getDateString(today);
    
    // Fetch games for past 6 days + today + next 7 days (14 days total)
    const datePromises: Promise<{ homeTeam: string; awayTeam: string; date: string }[]>[] = [];
    const dates: Date[] = [];
    
    // Past 6 days
    for (let i = 6; i >= 1; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      dates.push(date);
      datePromises.push(fetchGamesForDate(date));
    }
    
    // Today + next 7 days
    for (let i = 0; i <= 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date);
      datePromises.push(fetchGamesForDate(date));
    }
    
    const allGamesPerDay = await Promise.all(datePromises);
    
    // Flatten all games with their dates
    const allGames: { homeTeam: string; awayTeam: string; date: string }[] = [];
    allGamesPerDay.forEach((games) => {
      allGames.push(...games);
    });
    
    // Get games for today and future (these are the ones we'll return rest data for)
    const upcomingGames = allGames.filter(g => g.date >= todayStr);
    
    // Build a map of each team's game dates (all games, past and future)
    const teamGameDates: { [team: string]: string[] } = {};
    
    for (const game of allGames) {
      // Track home team
      if (!teamGameDates[game.homeTeam]) {
        teamGameDates[game.homeTeam] = [];
      }
      if (!teamGameDates[game.homeTeam].includes(game.date)) {
        teamGameDates[game.homeTeam].push(game.date);
      }
      
      // Track away team
      if (!teamGameDates[game.awayTeam]) {
        teamGameDates[game.awayTeam] = [];
      }
      if (!teamGameDates[game.awayTeam].includes(game.date)) {
        teamGameDates[game.awayTeam].push(game.date);
      }
    }
    
    // Sort each team's game dates
    for (const team of Object.keys(teamGameDates)) {
      teamGameDates[team].sort();
    }
    
    // Calculate rest info for a team on a specific game date
    function getTeamRestInfo(teamName: string, gameDate: string): TeamRestInfo {
      const gameDates = teamGameDates[teamName] || [];
      
      // Filter to past games only (before the game date we're calculating for)
      const pastGames = gameDates.filter(d => d < gameDate).sort();
      const lastGameDate = pastGames.length > 0 ? pastGames[pastGames.length - 1] : null;
      
      // Calculate rest days
      let restDays = 99; // Default to lots of rest if no recent games
      if (lastGameDate) {
        restDays = daysBetween(new Date(lastGameDate), new Date(gameDate)) - 1;
      }
      
      // Calculate games in last 4 days (before game date)
      const fourDaysAgo = new Date(gameDate);
      fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);
      const fourDaysAgoStr = getDateString(fourDaysAgo);
      const gamesLast4Days = pastGames.filter(d => d > fourDaysAgoStr).length;
      
      // Calculate games in last 6 days (before game date)
      const sixDaysAgo = new Date(gameDate);
      sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);
      const sixDaysAgoStr = getDateString(sixDaysAgo);
      const gamesLast6Days = pastGames.filter(d => d > sixDaysAgoStr).length;
      
      // Determine status flags
      // B2B = 0 days rest (played day before)
      const isB2B = restDays === 0;
      
      // 3in4 = playing 3rd game in 4 days (2 games in last 3 days + this game)
      const threeDaysAgo = new Date(gameDate);
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const threeDaysAgoStr = getDateString(threeDaysAgo);
      const gamesLast3Days = pastGames.filter(d => d > threeDaysAgoStr).length;
      const is3in4 = gamesLast3Days >= 2; // 2 games + this game = 3 in 4
      
      // 4in6 = playing 4th game in 6 days
      const fiveDaysAgo = new Date(gameDate);
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
      const fiveDaysAgoStr = getDateString(fiveDaysAgo);
      const gamesLast5Days = pastGames.filter(d => d > fiveDaysAgoStr).length;
      const is4in6 = gamesLast5Days >= 3; // 3 games + this game = 4 in 6
      
      return {
        teamName,
        teamAbbr: getTeamAbbr(teamName),
        restDays,
        isB2B,
        is3in4,
        is4in6,
        lastGameDate,
        gamesLast4Days,
        gamesLast6Days,
      };
    }
    
    // Build rest data for all upcoming games
    const restData: GameRestData[] = [];
    
    for (const game of upcomingGames) {
      const homeRest = getTeamRestInfo(game.homeTeam, game.date);
      const awayRest = getTeamRestInfo(game.awayTeam, game.date);
      
      // Calculate rest advantage
      let restAdvantage: 'home' | 'away' | 'even' = 'even';
      let restAdvantageDays = 0;
      
      if (homeRest.restDays > awayRest.restDays) {
        restAdvantage = 'home';
        restAdvantageDays = homeRest.restDays - awayRest.restDays;
      } else if (awayRest.restDays > homeRest.restDays) {
        restAdvantage = 'away';
        restAdvantageDays = awayRest.restDays - homeRest.restDays;
      }
      
      restData.push({
        gameId: `${game.awayTeam}@${game.homeTeam}`,
        gameDate: game.date,
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        homeRest,
        awayRest,
        restAdvantage,
        restAdvantageDays,
      });
    }
    
    return NextResponse.json({
      date: todayStr,
      games: restData,
    });
  } catch (error) {
    console.error('Error calculating NHL rest data:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}