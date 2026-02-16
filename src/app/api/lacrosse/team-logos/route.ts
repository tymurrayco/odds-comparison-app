// src/app/api/lacrosse/team-logos/route.ts

import { NextResponse } from 'next/server';
import { loadTeamOverrides } from '@/lib/lacrosse/supabase';

interface ESPNTeam {
  id: string;
  displayName: string;
  shortDisplayName?: string;
  abbreviation?: string;
  name?: string;
  logos?: Array<{
    href: string;
    width?: number;
    height?: number;
    rel?: string[];
  }>;
}

interface ESPNTeamsResponse {
  sports?: Array<{
    leagues?: Array<{
      teams?: Array<{
        team: ESPNTeam;
      }>;
    }>;
  }>;
}

// Cache the logos in memory (refreshed on server restart)
let logoCache: Map<string, string> | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

async function fetchTeamLogos(): Promise<Map<string, string>> {
  if (logoCache && Date.now() - cacheTimestamp < CACHE_DURATION) {
    return logoCache;
  }

  const logoMap = new Map<string, string>();

  try {
    // Use basketball teams endpoint — same schools, has logos
    // (ESPN lacrosse teams endpoint returns 0 teams)
    const response = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams?limit=400',
      { next: { revalidate: 86400 } }
    );

    if (!response.ok) {
      console.error('[Lacrosse Logos] ESPN API error:', response.status);
      return logoMap;
    }

    const data: ESPNTeamsResponse = await response.json();

    const teams = data.sports?.[0]?.leagues?.[0]?.teams || [];

    for (const { team } of teams) {
      const logo = team.logos?.[0]?.href;

      if (logo && team.displayName) {
        logoMap.set(team.displayName.toLowerCase(), logo);

        if (team.shortDisplayName) {
          logoMap.set(team.shortDisplayName.toLowerCase(), logo);
        }
        if (team.abbreviation) {
          logoMap.set(team.abbreviation.toLowerCase(), logo);
        }
        if (team.name) {
          logoMap.set(team.name.toLowerCase(), logo);
        }
      }
    }

    console.log(`[Lacrosse Logos] Loaded ${logoMap.size} team logos`);

    logoCache = logoMap;
    cacheTimestamp = Date.now();

    return logoMap;
  } catch (error) {
    console.error('[Lacrosse Logos] Error fetching logos:', error);
    return logoMap;
  }
}

export async function GET() {
  try {
    const logoMap = await fetchTeamLogos();

    const logos: Record<string, string> = {};
    for (const [name, url] of logoMap) {
      logos[name] = url;
    }

    // Load overrides to get Massey -> ESPN name mappings
    const overrides = await loadTeamOverrides();
    const espnNameMap: Record<string, string> = {};

    for (const override of overrides) {
      if (override.espnName) {
        espnNameMap[override.masseyName.toLowerCase()] = override.espnName.toLowerCase();
      }
    }

    return NextResponse.json({
      success: true,
      count: Object.keys(logos).length,
      logos,
      espnNameMap,
    });
  } catch (error) {
    console.error('[Lacrosse Logos] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch team logos' },
      { status: 500 }
    );
  }
}
