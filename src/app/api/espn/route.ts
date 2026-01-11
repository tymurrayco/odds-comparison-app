// src/app/api/espn/route.ts
import { NextResponse } from 'next/server';

// Map our league keys to ESPN API paths
const ESPN_LEAGUE_MAP: { [key: string]: { sport: string; league: string } } = {
  'americanfootball_nfl': { sport: 'football', league: 'nfl' },
  'americanfootball_ncaaf': { sport: 'football', league: 'college-football' },
  'basketball_nba': { sport: 'basketball', league: 'nba' },
  'basketball_ncaab': { sport: 'basketball', league: 'mens-college-basketball' },
  'icehockey_nhl': { sport: 'hockey', league: 'nhl' },
  'baseball_mlb': { sport: 'baseball', league: 'mlb' },
  'basketball_wnba': { sport: 'basketball', league: 'wnba' },
  'soccer_usa_mls': { sport: 'soccer', league: 'usa.1' },
  'soccer_epl': { sport: 'soccer', league: 'eng.1' },
};

export interface ESPNGameScore {
  homeTeam: string;
  awayTeam: string;
  homeScore: string;
  awayScore: string;
  homeLogo: string;
  awayLogo: string;
  period: number;
  displayClock: string;
  state: 'pre' | 'in' | 'post'; // pre-game, in-progress, completed
  statusDetail: string; // "Q3 8:42", "Halftime", "Final", etc.
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const league = searchParams.get('league');

  if (!league) {
    return NextResponse.json({ error: 'Missing league parameter' }, { status: 400 });
  }

  const espnLeague = ESPN_LEAGUE_MAP[league];
  if (!espnLeague) {
    return NextResponse.json({ error: 'Unsupported league' }, { status: 400 });
  }

  try {
    // Build the API URL - add groups=50 for college sports to get all games (not just top 25)
    let apiUrl = `https://site.api.espn.com/apis/site/v2/sports/${espnLeague.sport}/${espnLeague.league}/scoreboard`;
    
    // For college sports, add limit parameter to get more games
    if (espnLeague.league === 'mens-college-basketball' || espnLeague.league === 'college-football') {
      apiUrl += '?limit=200&groups=50';
    }
    
    console.log('Fetching ESPN scores:', apiUrl);

    const response = await fetch(apiUrl, {
      next: { revalidate: 30 } // Cache for 30 seconds
    });

    if (!response.ok) {
      console.error(`ESPN API error: ${response.status}`);
      return NextResponse.json({ error: 'ESPN API error' }, { status: response.status });
    }

    const data = await response.json();
    
    // Parse and simplify the ESPN response
    const scores: ESPNGameScore[] = [];
    
    interface ESPNCompetitor {
      homeAway: string;
      team?: { 
        displayName?: string; 
        name?: string;
        logo?: string;
      };
      score?: string;
    }
    
    interface ESPNStatus {
      period?: number;
      displayClock?: string;
      type?: { state?: string; shortDetail?: string; detail?: string };
    }
    
    interface ESPNCompetition {
      competitors?: ESPNCompetitor[];
      status?: ESPNStatus;
    }
    
    interface ESPNEvent {
      competitions?: ESPNCompetition[];
    }
    
    if (data.events && Array.isArray(data.events)) {
      for (const event of data.events as ESPNEvent[]) {
        const competition = event.competitions?.[0];
        if (!competition) continue;

        const competitors = competition.competitors || [];
        const homeTeam = competitors.find((c: ESPNCompetitor) => c.homeAway === 'home');
        const awayTeam = competitors.find((c: ESPNCompetitor) => c.homeAway === 'away');

        if (!homeTeam || !awayTeam) continue;

        const status = competition.status || {};
        const statusType = status.type || {};

        scores.push({
          homeTeam: homeTeam.team?.displayName || homeTeam.team?.name || '',
          awayTeam: awayTeam.team?.displayName || awayTeam.team?.name || '',
          homeScore: homeTeam.score || '0',
          awayScore: awayTeam.score || '0',
          homeLogo: homeTeam.team?.logo || '',
          awayLogo: awayTeam.team?.logo || '',
          period: status.period || 0,
          displayClock: status.displayClock || '',
          state: (statusType.state as 'pre' | 'in' | 'post') || 'pre',
          statusDetail: statusType.shortDetail || statusType.detail || '',
        });
      }
    }

    // Log team names for debugging
    console.log(`ESPN returned ${scores.length} games for ${league}`);
    if (scores.length > 0) {
      console.log('Sample teams:', scores.slice(0, 3).map(s => `${s.awayTeam} @ ${s.homeTeam}`));
    }

    return NextResponse.json({ scores, count: scores.length });
  } catch (error) {
    console.error('Error fetching ESPN scores:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}