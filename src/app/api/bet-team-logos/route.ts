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
  // ESPN ignores the groups filter on this endpoint and serves all 755 college
  // football teams — a 400 limit truncated the list and dropped teams (e.g. TCU).
  NCAAF: { sport: 'football', league: 'college-football', limit: 1000, groups: '80' },
  NBA: { sport: 'basketball', league: 'nba' },
  NCAAB: { sport: 'basketball', league: 'mens-college-basketball', limit: 1000, groups: '50' },
  MLB: { sport: 'baseball', league: 'mlb' },
  NHL: { sport: 'hockey', league: 'nhl' },
  MLS: { sport: 'soccer', league: 'usa.1' },
};

export interface BetTeamInfo {
  displayName: string;
  logo: string;
  color: string;          // hex without leading #, e.g., "aa182c"
  alternateColor?: string;
  abbreviation?: string;  // ESPN abbreviation (e.g., "KC", "TEX") — used by
                          // MyBets to shorten bet text so the spread fits
}

function normalize(s: string): string {
  // Accent-fold first (Jos\u00e9 -> Jose) so accented ESPN names and
  // unaccented typed names land on the same key.
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
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

// Leagues ESPN lists but ships without colors or logos (CFL returns 9 teams
// with no `color` and an empty `logos` array). Served from a static table
// instead: official primary/alternate colors, logos from /public/team-logos,
// and the common broadcast abbreviations (ESPN's CSP/EES/TAT are unfamiliar).
// Variants mirror the ESPN path: displayName, nickname (city), abbreviation.
interface StaticTeam {
  displayName: string;
  city: string;
  abbreviation: string;
  color: string;
  alternateColor: string;
  extraNames?: string[];
}

const STATIC_LEAGUES: Record<string, StaticTeam[]> = {
  CFL: [
    { displayName: 'BC Lions',                 city: 'BC',           abbreviation: 'BC',  color: 'f26522', alternateColor: '000000', extraNames: ['British Columbia Lions', 'Lions'] },
    { displayName: 'Calgary Stampeders',       city: 'Calgary',      abbreviation: 'CGY', color: 'd50032', alternateColor: '000000', extraNames: ['Stampeders', 'Stamps'] },
    { displayName: 'Edmonton Elks',            city: 'Edmonton',     abbreviation: 'EDM', color: '005a2b', alternateColor: 'ffb81c', extraNames: ['Elks'] },
    { displayName: 'Hamilton Tiger-Cats',      city: 'Hamilton',     abbreviation: 'HAM', color: 'ffb81c', alternateColor: '000000', extraNames: ['Tiger-Cats', 'Tiger Cats', 'Ticats'] },
    { displayName: 'Montreal Alouettes',       city: 'Montreal',     abbreviation: 'MTL', color: 'b71234', alternateColor: '003087', extraNames: ['Alouettes'] },
    { displayName: 'Ottawa Redblacks',         city: 'Ottawa',       abbreviation: 'OTT', color: 'c8102e', alternateColor: '000000', extraNames: ['Ottawa Red Blacks', 'Redblacks', 'Red Blacks'] },
    { displayName: 'Saskatchewan Roughriders', city: 'Saskatchewan', abbreviation: 'SSK', color: '006341', alternateColor: 'a2aaad', extraNames: ['Roughriders', 'Riders'] },
    { displayName: 'Toronto Argonauts',        city: 'Toronto',      abbreviation: 'TOR', color: '003f87', alternateColor: '5cb8e6', extraNames: ['Argonauts', 'Argos'] },
    { displayName: 'Winnipeg Blue Bombers',    city: 'Winnipeg',     abbreviation: 'WPG', color: '1b3e83', alternateColor: 'ffb81c', extraNames: ['Blue Bombers', 'Bombers'] },
  ],
};

function staticLeagueTeams(list: StaticTeam[]): Record<string, BetTeamInfo> {
  const teams: Record<string, BetTeamInfo> = {};
  for (const t of list) {
    const info: BetTeamInfo = {
      displayName: t.displayName,
      // Same file the legacy getTeamLogo() path resolves: lowercase, spaces stripped.
      logo: `/team-logos/${t.displayName.toLowerCase().replace(/\s+/g, '')}.png`,
      color: t.color,
      alternateColor: t.alternateColor,
      abbreviation: t.abbreviation,
    };
    const variants = [t.displayName, t.city, t.abbreviation, ...(t.extraNames ?? [])];
    for (const v of variants) {
      const key = normalize(v);
      if (key && !teams[key]) teams[key] = info;
    }
  }
  return teams;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const league = searchParams.get('league')?.toUpperCase();
  if (!league) {
    return NextResponse.json({ error: 'Missing league parameter' }, { status: 400 });
  }

  const staticList = STATIC_LEAGUES[league];
  if (staticList) {
    return NextResponse.json({ teams: staticLeagueTeams(staticList) });
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
        abbreviation: t.abbreviation,
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
