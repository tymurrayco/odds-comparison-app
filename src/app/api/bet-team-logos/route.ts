// src/app/api/bet-team-logos/route.ts
// Generic team logo + primary color endpoint for the Bet Admin UI.
// Hits ESPN's teams endpoint per league and builds a lookup keyed by multiple
// name variants (displayName, shortDisplayName, abbreviation, name, nickname)
// so user-entered team text has a reasonable chance of matching.

import { NextResponse } from 'next/server';

interface LeagueConfig {
  sport: string;
  league: string;
  limit?: number;
  groups?: string; // ESPN division filter (e.g., "50" for D1 NCAAB, "80" for FBS)
}

const LEAGUE_MAP: Record<string, LeagueConfig> = {
  NFL: { sport: 'football', league: 'nfl' },
  NCAAF: { sport: 'football', league: 'college-football', limit: 400, groups: '80' },
  NBA: { sport: 'basketball', league: 'nba' },
  NCAAB: { sport: 'basketball', league: 'mens-college-basketball', limit: 400, groups: '50' },
  MLB: { sport: 'baseball', league: 'mlb' },
  NHL: { sport: 'hockey', league: 'nhl' },
};

export interface BetTeamInfo {
  displayName: string;
  logo: string;
  color: string;          // hex without leading #, e.g., "aa182c"
  alternateColor?: string;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

interface ESPNTeam {
  displayName?: string;
  shortDisplayName?: string;
  abbreviation?: string;
  name?: string;
  nickname?: string;
  color?: string;
  alternateColor?: string;
  logos?: { href?: string }[];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const league = searchParams.get('league')?.toUpperCase();
  if (!league) {
    return NextResponse.json({ error: 'Missing league parameter' }, { status: 400 });
  }

  const config = LEAGUE_MAP[league];
  if (!config) {
    return NextResponse.json({ teams: {} });
  }

  const params = new URLSearchParams();
  if (config.limit) params.set('limit', String(config.limit));
  if (config.groups) params.set('groups', config.groups);
  const qs = params.toString();
  const url = `https://site.api.espn.com/apis/site/v2/sports/${config.sport}/${config.league}/teams${qs ? `?${qs}` : ''}`;

  try {
    const resp = await fetch(url, { next: { revalidate: 60 * 60 * 24 } });
    if (!resp.ok) {
      return NextResponse.json({ teams: {} });
    }
    const data = await resp.json();
    const espnTeams: { team?: ESPNTeam }[] = data?.sports?.[0]?.leagues?.[0]?.teams ?? [];

    const teams: Record<string, BetTeamInfo> = {};

    for (const entry of espnTeams) {
      const t = entry.team;
      if (!t) continue;
      const logo = t.logos?.[0]?.href || '';
      if (!logo) continue;

      const info: BetTeamInfo = {
        displayName: t.displayName || t.name || '',
        logo,
        color: t.color || '',
        alternateColor: t.alternateColor,
      };

      const variants = [t.displayName, t.shortDisplayName, t.abbreviation, t.name, t.nickname];
      for (const v of variants) {
        if (!v) continue;
        const key = normalize(v);
        if (key && !teams[key]) teams[key] = info;
      }
    }

    return NextResponse.json({ teams });
  } catch (error) {
    console.error('bet-team-logos error:', error);
    return NextResponse.json({ teams: {} });
  }
}
