// src/app/api/ratings/neutral-sites/route.ts
// Returns neutral site team pairs from ESPN scoreboard for given dates

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface ESPNResponse {
  events?: Array<{
    competitions?: Array<{
      neutralSite?: boolean;
      venue?: { neutral?: boolean };
      competitors?: Array<{
        homeAway: string;
        team?: { displayName?: string; name?: string };
      }>;
    }>;
  }>;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const datesParam = searchParams.get('dates'); // comma-separated YYYY-MM-DD

  if (!datesParam) {
    return NextResponse.json({ error: 'dates parameter required' }, { status: 400 });
  }

  const dates = datesParam.split(',').slice(0, 4); // max 4 dates
  const neutralGames: Array<{ homeTeam: string; awayTeam: string; date: string }> = [];

  for (const date of dates) {
    const espnDate = date.replace(/-/g, '');
    try {
      const res = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${espnDate}&limit=200&groups=50`,
        { next: { revalidate: 3600 } }
      );
      if (!res.ok) continue;

      const data: ESPNResponse = await res.json();
      for (const event of data.events || []) {
        const comp = event.competitions?.[0];
        if (!comp) continue;
        const isNeutral = comp.neutralSite === true || comp.venue?.neutral === true;
        if (!isNeutral) continue;

        const home = comp.competitors?.find(c => c.homeAway === 'home');
        const away = comp.competitors?.find(c => c.homeAway === 'away');
        if (home?.team && away?.team) {
          neutralGames.push({
            homeTeam: home.team.displayName || home.team.name || '',
            awayTeam: away.team.displayName || away.team.name || '',
            date,
          });
        }
      }
    } catch {
      // Skip date on error
    }
  }

  return NextResponse.json({ success: true, neutralGames });
}
