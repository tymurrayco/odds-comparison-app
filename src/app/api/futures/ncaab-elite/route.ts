// src/app/api/futures/ncaab-elite/route.ts

import { NextResponse } from 'next/server';
import { KENPOM_API_BASE_URL } from '@/lib/ratings/constants';

/**
 * NCAAB Elite Teams API
 * 
 * Fetches KenPom ratings and returns teams that are top 25 in BOTH:
 * - Adjusted Offensive Efficiency (AdjOE / RankAdjOE)
 * - Adjusted Defensive Efficiency (AdjDE / RankAdjDE)
 * 
 * These teams represent the "elite" programs with both strong offense and defense.
 * Used to highlight teams in the NCAAB Futures table.
 */

interface KenPomRating {
  TeamName: string;
  TeamID: number;
  Season: number;
  AdjEM: number;
  RankAdjEM: number;
  AdjOE: number;
  RankAdjOE: number;
  AdjDE: number;
  RankAdjDE: number;
  AdjTempo: number;
  RankAdjTempo: number;
}

// Common mascots to strip for matching
const MASCOTS = [
  'wildcats', 'bulldogs', 'tigers', 'bears', 'eagles', 'cardinals', 'hokies',
  'hurricanes', 'panthers', 'yellow jackets', 'fighting irish', 'demon deacons',
  'seminoles', 'blue devils', 'cavaliers', 'spartans', 'buckeyes', 'nittany lions',
  'wolverines', 'hoosiers', 'boilermakers', 'fighting illini', 'hawkeyes', 'badgers',
  'golden gophers', 'cornhuskers', 'scarlet knights', 'terrapins', 'bruins', 'trojans',
  'ducks', 'huskies', 'jayhawks', 'cyclones', 'red raiders', 'mountaineers',
  'horned frogs', 'longhorns', 'sooners', 'cougars', 'knights', 'bearcats',
  'sun devils', 'buffaloes', 'utes', 'volunteers', 'crimson tide', 'razorbacks',
  'gators', 'rebels', 'gamecocks', 'aggies', 'commodores', 'musketeers', 'friars',
  'pirates', 'red storm', 'golden eagles', 'blue demons', 'hoyas', 'gaels', 'rams',
  'flyers', 'wolf pack', 'broncos', 'lobos', 'aztecs', 'shockers', 'tar heels',
  'orange', 'wolfpack', 'thundering herd', 'zags', 'orangemen', 'crimson',
  'cardinal', 'owls', 'hawks', 'flames', 'phoenix', 'ramblers', 'billikens',
  'bonnies', 'colonials', 'explorers', 'dukes', 'spiders', 'toreros', 'dons',
  'waves', 'pilots', 'lakers', 'anteaters', 'gauchos', 'matadors', 'tritons',
  'aggies', 'roadrunners', 'miners', 'mean green', 'monarchs', 'keydets'
];

/**
 * Normalize team name for matching
 * Strips mascots, normalizes State/St., lowercases
 */
function normalizeForMatch(name: string): string {
  let normalized = name.toLowerCase().trim();
  
  // Remove mascots
  for (const mascot of MASCOTS) {
    normalized = normalized.replace(new RegExp(`\\s+${mascot}$`, 'i'), '');
  }
  
  // Normalize whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  // Normalize variations
  normalized = normalized
    .replace(/\bstate\b/gi, 'st')
    .replace(/\bst\.\b/gi, 'st')
    .replace(/\bsaint\b/gi, 'st')
    .replace(/\buniversity\b/gi, '')
    .replace(/\bcollege\b/gi, '')
    .replace(/[.'()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  return normalized;
}

export async function GET() {
  const apiKey = process.env.KENPOM_API_KEY;
  
  if (!apiKey) {
    console.error('[NCAAB Elite] KenPom API key not configured');
    return NextResponse.json({
      success: false,
      error: 'KenPom API key not configured',
      eliteTeams: [],
      eliteTeamsNormalized: []
    });
  }
  
  try {
    // Fetch current KenPom ratings - MUST include year parameter
    // Determine current season dynamically:
    // Season runs Sep-Aug, so Sep 2025 - Aug 2026 = "2026" season
    const now = new Date();
    const month = now.getMonth(); // 0-11 (0 = Jan, 8 = Sep)
    const year = now.getFullYear();
    const currentSeason = month >= 8 ? year + 1 : year; // Sep-Dec = next year, Jan-Aug = current year
    
    const url = `${KENPOM_API_BASE_URL}?endpoint=ratings&y=${currentSeason}`;
    
    console.log('[NCAAB Elite] Fetching KenPom ratings...');
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      next: { revalidate: 3600 }, // Cache for 1 hour
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[NCAAB Elite] KenPom API error ${response.status}:`, errorText);
      return NextResponse.json({
        success: false,
        error: `KenPom API error: ${response.status}`,
        eliteTeams: [],
        eliteTeamsNormalized: []
      });
    }
    
    const ratings: KenPomRating[] = await response.json();
    
    console.log(`[NCAAB Elite] Received ${ratings.length} team ratings`);
    
    // Filter for elite teams: top 25 in BOTH Ortg AND Drtg
    const eliteTeams = ratings.filter(team => 
      team.RankAdjOE <= 25 && team.RankAdjDE <= 25
    );
    
    console.log(`[NCAAB Elite] Found ${eliteTeams.length} elite teams (Top 25 O & D)`);
    
    // Build response with both original names and normalized versions for matching
    const eliteTeamData = eliteTeams.map(team => ({
      name: team.TeamName,
      normalized: normalizeForMatch(team.TeamName),
      rankOE: team.RankAdjOE,
      rankDE: team.RankAdjDE,
      rankEM: team.RankAdjEM,
      adjOE: team.AdjOE,
      adjDE: team.AdjDE,
      adjEM: team.AdjEM
    }));
    
    // Log elite teams for debugging
    eliteTeamData.forEach(team => {
      console.log(`[NCAAB Elite] ${team.name}: O#${team.rankOE}, D#${team.rankDE}, EM#${team.rankEM}`);
    });
    
    return NextResponse.json({
      success: true,
      count: eliteTeams.length,
      eliteTeams: eliteTeamData.map(t => t.name),
      eliteTeamsNormalized: eliteTeamData.map(t => t.normalized),
      details: eliteTeamData
    });
    
  } catch (error) {
    console.error('[NCAAB Elite] Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch KenPom data',
      eliteTeams: [],
      eliteTeamsNormalized: []
    });
  }
}
