// src/app/api/espn/route.ts
import { NextResponse } from 'next/server';

// Map our league keys to ESPN API paths
const ESPN_LEAGUE_MAP: { [key: string]: { sport: string; league: string } } = {
  'americanfootball_nfl': { sport: 'football', league: 'nfl' },
  'americanfootball_ncaaf': { sport: 'football', league: 'college-football' },
  'americanfootball_cfl': { sport: 'football', league: 'cfl' },
  'basketball_nba': { sport: 'basketball', league: 'nba' },
  'basketball_ncaab': { sport: 'basketball', league: 'mens-college-basketball' },
  'icehockey_nhl': { sport: 'hockey', league: 'nhl' },
  'baseball_mlb': { sport: 'baseball', league: 'mlb' },
  'basketball_wnba': { sport: 'basketball', league: 'wnba' },
  'soccer_usa_mls': { sport: 'soccer', league: 'usa.1' },
  'soccer_epl': { sport: 'soccer', league: 'eng.1' },
  'lacrosse_ncaa': { sport: 'lacrosse', league: 'mens-college-lacrosse' },
};

import type { ESPNGameScore } from '@/lib/api';

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
    // Build the API URL(s). College basketball needs groups=50 (all of D-I,
    // not just the top 25). College football uses different group ids —
    // 80 = FBS, 81 = FCS — and groups=50 returns ZERO football games, which
    // left every NCAAF card showing a start time mid-game. Fetch both
    // divisions and merge (FCS games sit on the odds board too).
    const base = `https://site.api.espn.com/apis/site/v2/sports/${espnLeague.sport}/${espnLeague.league}/scoreboard`;
    const apiUrls =
      espnLeague.league === 'college-football'
        ? [`${base}?limit=300&groups=80`, `${base}?limit=300&groups=81`]
        : espnLeague.league === 'mens-college-basketball'
          ? [`${base}?limit=200&groups=50`]
          : [base];

    const pages = await Promise.all(
      apiUrls.map(async (apiUrl) => {
        const response = await fetch(apiUrl, {
          next: { revalidate: 30 }, // Cache for 30 seconds
        });
        if (!response.ok) {
          console.error(`ESPN API error: ${response.status} for ${apiUrl}`);
          return null;
        }
        return response.json();
      })
    );
    if (pages.every((p) => p === null)) {
      return NextResponse.json({ error: 'ESPN API error' }, { status: 502 });
    }
    const seen = new Set<string>();
    const data = {
      events: pages.flatMap((p) => (p?.events ?? []) as Array<{ id?: string }>).filter((e) => {
        const id = String(e?.id ?? '');
        if (id && seen.has(id)) return false;
        if (id) seen.add(id);
        return true;
      }),
    };
    
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