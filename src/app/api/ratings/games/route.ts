// src/app/api/ratings/games/route.ts

import { NextRequest, NextResponse } from 'next/server';

/**
 * Historical Games API Route
 * 
 * Fetches completed NCAAB games from ESPN for a date range.
 * Used to get the list of games that need closing line processing.
 * 
 * Query parameters:
 * - startDate: string (YYYY-MM-DD) - Start of date range
 * - endDate: string (YYYY-MM-DD) - End of date range (default: today)
 * - limit: number - Max games to return (default: 500)
 */

interface ESPNCompetitor {
  homeAway: 'home' | 'away';
  team?: {
    displayName?: string;
    name?: string;
    abbreviation?: string;
  };
  score?: string;
  winner?: boolean;
}

interface ESPNVenue {
  fullName?: string;
  city?: string;
  state?: string;
  neutral?: boolean;
}

interface ESPNCompetition {
  id: string;
  date: string;
  competitors?: ESPNCompetitor[];
  venue?: ESPNVenue;
  neutralSite?: boolean;
  conferenceCompetition?: boolean;
  status?: {
    type?: {
      state?: string;
      completed?: boolean;
    };
  };
}

interface ESPNEvent {
  id: string;
  date: string;
  name?: string;
  competitions?: ESPNCompetition[];
}

interface ESPNResponse {
  events?: ESPNEvent[];
}

export interface HistoricalGame {
  id: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamAbbr?: string;
  awayTeamAbbr?: string;
  homeScore?: number;
  awayScore?: number;
  isCompleted: boolean;
  isNeutralSite: boolean;
  venue?: string;
}

// Format date for ESPN API (YYYYMMDD)
function formatDateForESPN(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

// Parse date string (YYYY-MM-DD) to Date object
function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Fetch games for a specific date from ESPN
async function fetchGamesForDate(date: Date): Promise<HistoricalGame[]> {
  const dateStr = formatDateForESPN(date);
  const apiUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${dateStr}&limit=200&groups=50`;
  
  try {
    const response = await fetch(apiUrl, { 
      next: { revalidate: 3600 } // Cache for 1 hour
    });
    
    if (!response.ok) {
      console.error(`[Historical Games] ESPN API error for date ${dateStr}:`, response.status);
      return [];
    }
    
    const data: ESPNResponse = await response.json();
    const games: HistoricalGame[] = [];
    
    if (data.events && Array.isArray(data.events)) {
      for (const event of data.events) {
        const competition = event.competitions?.[0];
        if (!competition) continue;
        
        const competitors = competition.competitors || [];
        const homeTeam = competitors.find(c => c.homeAway === 'home');
        const awayTeam = competitors.find(c => c.homeAway === 'away');
        
        if (!homeTeam || !awayTeam) continue;
        
        const isCompleted = competition.status?.type?.completed === true ||
                           competition.status?.type?.state === 'post';
        
        // Determine if neutral site
        const isNeutralSite = competition.neutralSite === true || 
                             competition.venue?.neutral === true;
        
        games.push({
          id: event.id,
          date: competition.date || event.date,
          homeTeam: homeTeam.team?.displayName || homeTeam.team?.name || 'Unknown',
          awayTeam: awayTeam.team?.displayName || awayTeam.team?.name || 'Unknown',
          homeTeamAbbr: homeTeam.team?.abbreviation,
          awayTeamAbbr: awayTeam.team?.abbreviation,
          homeScore: homeTeam.score ? parseInt(homeTeam.score) : undefined,
          awayScore: awayTeam.score ? parseInt(awayTeam.score) : undefined,
          isCompleted,
          isNeutralSite,
          venue: competition.venue?.fullName,
        });
      }
    }
    
    return games;
  } catch (error) {
    console.error(`[Historical Games] Error fetching date ${dateStr}:`, error);
    return [];
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const startDateParam = searchParams.get('startDate');
  const endDateParam = searchParams.get('endDate');
  const limitParam = searchParams.get('limit');
  
  if (!startDateParam) {
    return NextResponse.json(
      { error: 'startDate parameter is required (YYYY-MM-DD)' },
      { status: 400 }
    );
  }
  
  const startDate = parseDate(startDateParam);
  const endDate = endDateParam ? parseDate(endDateParam) : new Date();
  const limit = limitParam ? parseInt(limitParam) : 500;
  
  // Validate dates
  if (isNaN(startDate.getTime())) {
    return NextResponse.json(
      { error: 'Invalid startDate format. Use YYYY-MM-DD' },
      { status: 400 }
    );
  }
  
  if (isNaN(endDate.getTime())) {
    return NextResponse.json(
      { error: 'Invalid endDate format. Use YYYY-MM-DD' },
      { status: 400 }
    );
  }
  
  // Don't allow more than 120 days of data at once
  const maxDays = 120;
  const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysDiff > maxDays) {
    return NextResponse.json(
      { error: `Date range too large. Maximum is ${maxDays} days.` },
      { status: 400 }
    );
  }
  
  console.log(`[Historical Games] Fetching games from ${startDateParam} to ${endDateParam || 'today'}`);
  
  try {
    const allGames: HistoricalGame[] = [];
    const currentDate = new Date(startDate);
    let daysProcessed = 0;
    
    // Iterate through each day
    while (currentDate <= endDate && allGames.length < limit) {
      const dayGames = await fetchGamesForDate(currentDate);
      
      // Only add completed games
      const completedGames = dayGames.filter(g => g.isCompleted);
      allGames.push(...completedGames);
      
      daysProcessed++;
      currentDate.setDate(currentDate.getDate() + 1);
      
      // Small delay to avoid rate limiting
      if (daysProcessed % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // Sort by date (oldest first for chronological processing)
    allGames.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    // Apply limit
    const limitedGames = allGames.slice(0, limit);
    
    console.log(`[Historical Games] Found ${limitedGames.length} completed games over ${daysProcessed} days`);
    
    return NextResponse.json({
      success: true,
      startDate: startDateParam,
      endDate: endDateParam || new Date().toISOString().split('T')[0],
      daysProcessed,
      totalGames: limitedGames.length,
      games: limitedGames,
    });
    
  } catch (error) {
    console.error('[Historical Games] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch historical games' },
      { status: 500 }
    );
  }
}
