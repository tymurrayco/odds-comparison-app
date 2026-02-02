// src/app/api/futures/ncaab-elite/route.ts

import { NextResponse } from 'next/server';
import { KENPOM_API_BASE_URL } from '@/lib/ratings/constants';

/**
 * NCAAB Elite Teams API
 * 
 * Fetches KenPom ratings and returns teams classified by tier:
 * 
 * ELITE (green): Top 20 in BOTH Adjusted Offensive & Defensive Efficiency
 * BORDERLINE (yellow): Top 25 in both, but at least one rank is 21-25
 * 
 * These teams represent programs with strong offense and defense.
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

export type EliteTier = 'elite' | 'borderline';

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

/**
 * Determine elite tier based on offensive and defensive efficiency ranks
 * - Elite: Both RankAdjOE and RankAdjDE are <= 20
 * - Borderline: Both are <= 25, but at least one is 21-25
 * - null: Does not qualify
 */
function getEliteTier(rankOE: number, rankDE: number): EliteTier | null {
  // Must be top 25 in both to qualify at all
  if (rankOE > 25 || rankDE > 25) {
    return null;
  }
  
  // Elite: Both top 20
  if (rankOE <= 20 && rankDE <= 20) {
    return 'elite';
  }
  
  // Borderline: Both top 25, but at least one is 21-25
  return 'borderline';
}

export async function GET() {
  const apiKey = process.env.KENPOM_API_KEY;
  
  if (!apiKey) {
    console.error('[NCAAB Elite] KenPom API key not configured');
    return NextResponse.json({
      success: false,
      error: 'KenPom API key not configured',
      eliteTeams: [],
      eliteTeamsNormalized: [],
      details: []
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
        eliteTeamsNormalized: [],
        details: []
      });
    }
    
    const ratings: KenPomRating[] = await response.json();
    
    console.log(`[NCAAB Elite] Received ${ratings.length} team ratings`);
    
    // Build response with tier classification for ALL teams
    const allTeamData = ratings.map(team => {
      const tier = getEliteTier(team.RankAdjOE, team.RankAdjDE);
      return {
        name: team.TeamName,
        normalized: normalizeForMatch(team.TeamName),
        tier: tier, // Can be 'elite', 'borderline', or null
        rankOE: team.RankAdjOE,
        rankDE: team.RankAdjDE,
        rankEM: team.RankAdjEM,
        adjOE: team.AdjOE,
        adjDE: team.AdjDE,
        adjEM: team.AdjEM
      };
    });
    
    // Filter for qualifying teams (for counts and legacy fields)
    const qualifyingTeams = allTeamData.filter(t => t.tier !== null);
    
    // Count by tier
    const eliteCount = allTeamData.filter(t => t.tier === 'elite').length;
    const borderlineCount = allTeamData.filter(t => t.tier === 'borderline').length;
    
    console.log(`[NCAAB Elite] Found ${eliteCount} elite teams (Top 20 O & D)`);
    console.log(`[NCAAB Elite] Found ${borderlineCount} borderline teams (Top 25 O & D, one 21-25)`);
    console.log(`[NCAAB Elite] Returning data for ${allTeamData.length} total teams`);
    
    // Log elite/borderline teams for debugging
    qualifyingTeams.forEach(team => {
      console.log(`[NCAAB Elite] ${team.name} [${team.tier!.toUpperCase()}]: O#${team.rankOE}, D#${team.rankDE}, EM#${team.rankEM}`);
    });
    
    return NextResponse.json({
      success: true,
      count: qualifyingTeams.length,
      totalTeams: allTeamData.length,
      eliteCount,
      borderlineCount,
      eliteTeams: qualifyingTeams.map(t => t.name),
      eliteTeamsNormalized: qualifyingTeams.map(t => t.normalized),
      details: allTeamData // All teams with their rankings
    });
    
  } catch (error) {
    console.error('[NCAAB Elite] Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch KenPom data',
      eliteTeams: [],
      eliteTeamsNormalized: [],
      details: []
    });
  }
}
