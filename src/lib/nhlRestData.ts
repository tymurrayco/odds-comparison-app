// src/lib/nhlRestData.ts
// Server-side NHL rest computation. Lives in a lib (not the route) so the
// /api/nhl-rest endpoint and the Discord rest-report sender share one
// implementation.
// src/app/api/nhl-rest/route.ts

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

// How many days of schedule history we fetch. Rest beyond this is unknowable,
// so restDays is capped rather than reported as a sentinel.
const LOOKBACK_DAYS = 6;
const MAX_REST_DAYS = LOOKBACK_DAYS + 1; // ">= 7 days off" ceiling

// All date math is UTC-based on YYYY-MM-DD strings. The previous version parsed
// ISO strings as UTC but mutated them with local setDate(), which drifts a day
// on any non-UTC server (fine on Vercel, wrong in local dev).
function parseISO(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function isoFromUTC(ms: number): string {
  return new Date(ms).toISOString().split('T')[0];
}

function addDays(dateStr: string, delta: number): string {
  return isoFromUTC(parseISO(dateStr) + delta * 86400000);
}

// Helper to format date for ESPN API (YYYYMMDD)
function formatDateForESPN(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

// Whole days from date1 to date2 (both YYYY-MM-DD)
function daysBetween(date1: string, date2: string): number {
  return Math.round(Math.abs(parseISO(date2) - parseISO(date1)) / 86400000);
}

// "Today" in US Eastern — NHL schedules are ET. Intl handles EST/EDT, unlike
// the previous hardcoded -5 offset (wrong for the entire spring + playoffs).
function easternToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

// Fetch games for a specific date from ESPN
async function fetchGamesForDate(dateStr: string): Promise<{ homeTeam: string; awayTeam: string; date: string }[]> {
  const apiUrl = `https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates=${formatDateForESPN(dateStr)}`;
  
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
            date: dateStr,
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

export async function getNHLRestData(): Promise<GameRestData[]> {
  try {
    // NHL schedules are ET; Intl gives the correct Eastern calendar day
    // year-round (EST and EDT), which the old fixed -5 offset did not.
    const todayStr = easternToday();

    // Past LOOKBACK_DAYS + today + next 7 days
    const datePromises: Promise<{ homeTeam: string; awayTeam: string; date: string }[]>[] = [];
    for (let i = LOOKBACK_DAYS; i >= 1; i--) {
      datePromises.push(fetchGamesForDate(addDays(todayStr, -i)));
    }
    for (let i = 0; i <= 7; i++) {
      datePromises.push(fetchGamesForDate(addDays(todayStr, i)));
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
      
      // Rest days, capped at the lookback horizon. Previously an unseen prior
      // game meant restDays = 99, which flowed into restAdvantageDays and
      // rendered nonsense badges like "96RA" after a bye week / All-Star break.
      const restDays = lastGameDate
        ? Math.min(daysBetween(lastGameDate, gameDate) - 1, MAX_REST_DAYS)
        : MAX_REST_DAYS;

      // Games within the trailing N calendar days, INCLUSIVE of day N.
      // The old windows used `d > gameDate - N`, silently dropping day N: the
      // "3 in 4" test only saw days 1-2 back (really 3-in-3) and "4 in 6" only
      // saw days 1-4 (really 4-in-5), so most true situations went unflagged.
      const gamesWithin = (days: number) => {
        const cutoff = addDays(gameDate, -days);
        return pastGames.filter(d => d >= cutoff).length;
      };

      const gamesLast4Days = gamesWithin(4);
      const gamesLast6Days = gamesWithin(6);

      // B2B = 0 days rest (played the day before)
      const isB2B = restDays === 0;
      // 3 games across a 4-day span = 2 prior games within 3 days + this one
      const is3in4 = gamesWithin(3) >= 2;
      // 4 games across a 6-day span = 3 prior games within 5 days + this one
      const is4in6 = gamesWithin(5) >= 3;
      
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
    
    return restData;
  } catch (error) {
    console.error('Error calculating NHL rest data:', error);
    return [];
  }
}

/** Eastern "today" — exported so callers can label a digest. */
export function nhlToday(): string {
  return easternToday();
}
