// src/app/api/ratings/team-logos/route.ts

import { NextResponse } from 'next/server';
import { loadTeamOverrides } from '@/lib/ratings/supabase';

/**
 * Team Logos API Route
 * 
 * Fetches NCAAB team logos from ESPN's teams API.
 * Returns a map of team name -> logo URL
 * Also returns override mappings for KenPom -> ESPN name lookups
 */

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
  // Return cached if valid
  if (logoCache && Date.now() - cacheTimestamp < CACHE_DURATION) {
    return logoCache;
  }

  const logoMap = new Map<string, string>();
  
  try {
    // ESPN's teams endpoint for men's college basketball
    const response = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams?limit=400',
      { next: { revalidate: 86400 } } // Cache for 24 hours
    );
    
    if (!response.ok) {
      console.error('[Team Logos] ESPN API error:', response.status);
      return logoMap;
    }
    
    const data: ESPNTeamsResponse = await response.json();
    
    const teams = data.sports?.[0]?.leagues?.[0]?.teams || [];
    
    for (const { team } of teams) {
      // Get the default logo (usually first one)
      const logo = team.logos?.[0]?.href;
      
      if (logo && team.displayName) {
        // Store by display name (what ESPN uses in games)
        logoMap.set(team.displayName.toLowerCase(), logo);
        
        // Also store by short name and abbreviation for fallback matching
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
    
    console.log(`[Team Logos] Loaded ${logoMap.size} team logos`);
    
    // Update cache
    logoCache = logoMap;
    cacheTimestamp = Date.now();
    
    return logoMap;
  } catch (error) {
    console.error('[Team Logos] Error fetching logos:', error);
    return logoMap;
  }
}

export async function GET() {
  try {
    const logoMap = await fetchTeamLogos();
    
    // Convert map to object for JSON response
    const logos: Record<string, string> = {};
    for (const [name, url] of logoMap) {
      logos[name] = url;
    }
    
    // Load overrides to get KenPom -> ESPN name mappings
    const overrides = await loadTeamOverrides();
    const espnNameMap: Record<string, string> = {};
    
    for (const override of overrides) {
      if (override.espnName) {
        // Map KenPom name to ESPN name for logo lookup
        espnNameMap[override.kenpomName.toLowerCase()] = override.espnName.toLowerCase();
      }
    }
    
    return NextResponse.json({
      success: true,
      count: Object.keys(logos).length,
      logos,
      espnNameMap, // KenPom name -> ESPN name for teams that need manual mapping
    });
  } catch (error) {
    console.error('[Team Logos] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch team logos' },
      { status: 500 }
    );
  }
}
