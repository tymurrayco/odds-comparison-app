// src/app/api/ratings/overrides/route.ts

import { NextRequest, NextResponse } from 'next/server';
import {
  loadTeamOverrides,
  addTeamOverride,
  updateTeamOverride,
  deleteTeamOverride,
  loadRatings,
  saveRating,
  saveGameAdjustment,
  TeamOverride,
  getSupabaseClient,
} from '@/lib/ratings/supabase';
import { processGame } from '@/lib/ratings/engine';
import { findTeamByName } from '@/lib/ratings/team-mapping';
import { DEFAULT_RATINGS_CONFIG } from '@/lib/ratings/constants';

/**
 * Team Overrides API
 * 
 * GET: List all overrides
 * POST: Add new override + auto-process affected games
 * PUT: Update existing override
 * DELETE: Remove override
 */

export async function GET() {
  try {
    const [overrides, ratings] = await Promise.all([
      loadTeamOverrides(),
      loadRatings(2026),
    ]);
    
    // Get list of valid KenPom team names for autocomplete
    const kenpomTeams = Array.from(ratings.keys()).sort();
    
    return NextResponse.json({
      success: true,
      overrides,
      kenpomTeams,
    });
  } catch (error) {
    console.error('[Overrides API] GET error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load overrides',
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.sourceName || !body.kenpomName) {
      return NextResponse.json({
        success: false,
        error: 'sourceName and kenpomName are required',
      }, { status: 400 });
    }
    
    // Load ratings for validation and processing
    const ratings = await loadRatings(2026);
    
    // Validate kenpomName exists in ratings
    let kenpomName = body.kenpomName;
    if (!ratings.has(kenpomName)) {
      // Try case-insensitive match
      let found = false;
      for (const name of ratings.keys()) {
        if (name.toLowerCase() === kenpomName.toLowerCase()) {
          kenpomName = name; // Use correct casing
          found = true;
          break;
        }
      }
      if (!found) {
        return NextResponse.json({
          success: false,
          error: `KenPom team "${body.kenpomName}" not found in ratings`,
        }, { status: 400 });
      }
    }
    
    const sourceName = body.sourceName.trim();
    
    const override: TeamOverride = {
      sourceName,
      kenpomName,
      source: body.source || 'manual',
      notes: body.notes?.trim(),
    };
    
    const result = await addTeamOverride(override);
    
    if (!result) {
      return NextResponse.json({
        success: false,
        error: 'Failed to add override (may already exist)',
      }, { status: 500 });
    }
    
    // Auto-process affected games
    const processedGames = await processAffectedGames(sourceName, kenpomName, ratings);
    
    return NextResponse.json({
      success: true,
      override: result,
      gamesProcessed: processedGames.processed,
      gamesUpdated: processedGames.updated,
    });
  } catch (error) {
    console.error('[Overrides API] POST error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add override',
    }, { status: 500 });
  }
}

/**
 * Process games that were previously skipped due to unmatched team name
 */
async function processAffectedGames(
  sourceName: string, 
  kenpomName: string,
  ratings: Map<string, { teamName: string; rating: number; initialRating: number; gamesProcessed: number; conference?: string; lastUpdated: string }>
): Promise<{ processed: number; updated: number }> {
  const supabase = getSupabaseClient();
  const season = 2026;
  const config = { ...DEFAULT_RATINGS_CONFIG, season };
  
  let processed = 0;
  let updated = 0;
  
  // Find affected matching logs (where this team was not found)
  // Use separate queries to avoid issues with special characters in team names
  const { data: homeLogs, error: homeError } = await supabase
    .from('ncaab_matching_logs')
    .select('*')
    .eq('season', season)
    .neq('status', 'success')
    .ilike('espn_home', sourceName);
  
  const { data: awayLogs, error: awayError } = await supabase
    .from('ncaab_matching_logs')
    .select('*')
    .eq('season', season)
    .neq('status', 'success')
    .ilike('espn_away', sourceName);
  
  if (homeError || awayError) {
    console.error('[Overrides] Error finding affected logs:', homeError || awayError);
    return { processed: 0, updated: 0 };
  }
  
  // Combine and dedupe by game_id
  const seenGameIds = new Set<string>();
  const affectedLogs: typeof homeLogs = [];
  
  for (const log of [...(homeLogs || []), ...(awayLogs || [])]) {
    if (!seenGameIds.has(log.game_id)) {
      seenGameIds.add(log.game_id);
      affectedLogs.push(log);
    }
  }
  
  console.log(`[Overrides] Found ${affectedLogs.length} affected games for "${sourceName}"`);
  
  // Build ratings lookup
  const ratingsLookup = new Map<string, number>();
  for (const [name, rating] of ratings) {
    ratingsLookup.set(name, rating.rating);
  }
  
  // Load all overrides for matching the other team
  const { data: allOverrides } = await supabase
    .from('ncaab_team_overrides')
    .select('source_name, kenpom_name');
  
  const overrideMap = new Map<string, string>();
  for (const o of allOverrides || []) {
    overrideMap.set(o.source_name.toLowerCase(), o.kenpom_name);
  }
  
  // Helper to find team - uses overrides first, then smart matching
  const findTeam = (teamName: string): string | null => {
    // Check override first
    const override = overrideMap.get(teamName.toLowerCase());
    if (override && ratings.has(override)) return override;
    
    // Use smart matching from team-mapping module
    const match = findTeamByName(teamName, ratingsLookup);
    if (match) return match.name;
    
    return null;
  };
  
  for (const log of affectedLogs) {
    // Get cached closing line
    const { data: closingLine } = await supabase
      .from('ncaab_closing_lines')
      .select('*')
      .eq('game_id', log.game_id)
      .single();
    
    if (!closingLine || closingLine.closing_spread === null) {
      console.log(`[Overrides] No closing line for game ${log.game_id}, skipping`);
      continue;
    }
    
    // Try to match both teams now
    const homeTeam = findTeam(log.espn_home);
    const awayTeam = findTeam(log.espn_away);
    
    if (!homeTeam || !awayTeam) {
      // Still can't match both teams - update the log with partial progress
      const newStatus = !homeTeam && !awayTeam ? 'both_not_found' 
        : !homeTeam ? 'home_not_found' 
        : 'away_not_found';
      
      await supabase
        .from('ncaab_matching_logs')
        .update({
          matched_home: homeTeam,
          matched_away: awayTeam,
          home_found: !!homeTeam,
          away_found: !!awayTeam,
          status: newStatus,
          skip_reason: !homeTeam && !awayTeam 
            ? 'Both teams not found' 
            : `${!homeTeam ? log.espn_home : log.espn_away} not found`,
        })
        .eq('game_id', log.game_id)
        .eq('season', season);
      
      updated++;
      continue;
    }
    
    // Both teams matched! Process the game
    console.log(`[Overrides] Processing game: ${awayTeam} @ ${homeTeam}`);
    
    // Check if game was already processed (shouldn't happen, but safety check)
    const { data: existingAdj } = await supabase
      .from('ncaab_game_adjustments')
      .select('game_id')
      .eq('game_id', log.game_id)
      .single();
    
    if (existingAdj) {
      console.log(`[Overrides] Game ${log.game_id} already processed, skipping`);
      continue;
    }
    
    // Process the game
    const adjustment = processGame(
      {
        id: log.game_id,
        date: log.game_date,
        homeTeam,
        awayTeam,
        closingSpread: closingLine.closing_spread,
        closingSource: closingLine.closing_source || 'us_average',
        isNeutralSite: false, // TODO: get from original game data
      },
      ratings,
      config
    );
    
    if (adjustment) {
      // Save adjustment
      await saveGameAdjustment(adjustment, season);
      
      // Update team ratings - use the team names from the adjustment
      // (processGame may have resolved them differently)
      const homeRating = ratings.get(adjustment.homeTeam);
      const awayRating = ratings.get(adjustment.awayTeam);
      
      console.log(`[Overrides] Saving ratings - Home: ${adjustment.homeTeam} (games: ${homeRating?.gamesProcessed}), Away: ${adjustment.awayTeam} (games: ${awayRating?.gamesProcessed})`);
      
      if (homeRating) await saveRating(homeRating, season);
      if (awayRating) await saveRating(awayRating, season);
      
      // Update matching log to success
      await supabase
        .from('ncaab_matching_logs')
        .update({
          matched_home: adjustment.homeTeam,
          matched_away: adjustment.awayTeam,
          home_found: true,
          away_found: true,
          status: 'success',
          skip_reason: null,
        })
        .eq('game_id', log.game_id)
        .eq('season', season);
      
      processed++;
      updated++;
    }
  }
  
  console.log(`[Overrides] Processed ${processed} games, updated ${updated} logs`);
  return { processed, updated };
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.id) {
      return NextResponse.json({
        success: false,
        error: 'id is required',
      }, { status: 400 });
    }
    
    // Validate kenpomName if provided
    if (body.kenpomName) {
      const ratings = await loadRatings(2026);
      if (!ratings.has(body.kenpomName)) {
        let found = false;
        for (const name of ratings.keys()) {
          if (name.toLowerCase() === body.kenpomName.toLowerCase()) {
            body.kenpomName = name;
            found = true;
            break;
          }
        }
        if (!found) {
          return NextResponse.json({
            success: false,
            error: `KenPom team "${body.kenpomName}" not found in ratings`,
          }, { status: 400 });
        }
      }
    }
    
    const success = await updateTeamOverride(body.id, {
      sourceName: body.sourceName?.trim(),
      kenpomName: body.kenpomName?.trim(),
      source: body.source,
      notes: body.notes?.trim(),
    });
    
    if (!success) {
      return NextResponse.json({
        success: false,
        error: 'Failed to update override',
      }, { status: 500 });
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Overrides API] PUT error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update override',
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'id is required',
      }, { status: 400 });
    }
    
    const success = await deleteTeamOverride(parseInt(id));
    
    if (!success) {
      return NextResponse.json({
        success: false,
        error: 'Failed to delete override',
      }, { status: 500 });
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Overrides API] DELETE error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete override',
    }, { status: 500 });
  }
}
