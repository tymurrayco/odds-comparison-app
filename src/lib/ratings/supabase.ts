// src/lib/ratings/supabase.ts

/**
 * Supabase Integration for Power Ratings
 * 
 * Handles all database operations:
 * - Loading/saving team ratings
 * - Storing game adjustments
 * - Caching closing lines
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { TeamRating, GameAdjustment, ClosingLineSource } from './types';

// ============================================
// Types
// ============================================

export interface DBTeamRating {
  team_name: string;
  kenpom_name: string;
  rating: number;
  initial_rating: number;
  games_processed: number;
  conference: string | null;
  season: number;
  updated_at: string;
}

export interface DBGameAdjustment {
  game_id: string;
  game_date: string;
  home_team: string;
  away_team: string;
  is_neutral_site: boolean;
  projected_spread: number;
  closing_spread: number;
  closing_source: string;
  difference: number;
  adjustment: number;
  home_rating_before: number;
  home_rating_after: number;
  away_rating_before: number;
  away_rating_after: number;
  season: number;
  processed_at: string;
}

export interface DBClosingLine {
  game_id: string;
  odds_api_id: string | null;
  game_date: string;
  home_team: string;
  away_team: string;
  closing_spread: number;
  closing_source: string;
  bookmakers: string[];
  fetched_at: string;
}

export interface DBRatingsConfig {
  id: number;
  hca: number;
  closing_source: string;
  season: number;
  last_processed_date: string | null;
  updated_at: string;
}

// ============================================
// Supabase Client
// ============================================

let supabase: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables');
    }
    
    supabase = createClient(supabaseUrl, supabaseKey);
  }
  
  return supabase;
}

// ============================================
// Ratings Operations
// ============================================

/**
 * Load all ratings from Supabase
 */
export async function loadRatings(season: number = 2026): Promise<Map<string, TeamRating>> {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('ncaab_ratings')
    .select('*')
    .eq('season', season)
    .order('rating', { ascending: false });
  
  if (error) {
    console.error('[Supabase] Error loading ratings:', error);
    throw error;
  }
  
  const ratings = new Map<string, TeamRating>();
  
  for (const row of data || []) {
    ratings.set(row.team_name, {
      teamName: row.team_name,
      kenpomName: row.kenpom_name,
      rating: row.rating,
      initialRating: row.initial_rating,
      gamesProcessed: row.games_processed,
      conference: row.conference,
      lastUpdated: row.updated_at,
    });
  }
  
  return ratings;
}

/**
 * Save a single team rating
 */
export async function saveRating(rating: TeamRating, season: number = 2026): Promise<void> {
  const supabase = getSupabaseClient();
  
  const { error } = await supabase
    .from('ncaab_ratings')
    .upsert({
      team_name: rating.teamName,
      kenpom_name: rating.kenpomName,
      rating: rating.rating,
      initial_rating: rating.initialRating,
      games_processed: rating.gamesProcessed,
      conference: rating.conference,
      season: season,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'team_name',
    });
  
  if (error) {
    console.error('[Supabase] Error saving rating:', error);
    throw error;
  }
}

/**
 * Bulk save ratings
 */
export async function saveRatings(ratings: Map<string, TeamRating>, season: number = 2026): Promise<void> {
  const supabase = getSupabaseClient();
  
  const rows = Array.from(ratings.values()).map(rating => ({
    team_name: rating.teamName,
    kenpom_name: rating.kenpomName,
    rating: rating.rating,
    initial_rating: rating.initialRating,
    games_processed: rating.gamesProcessed,
    conference: rating.conference,
    season: season,
    updated_at: new Date().toISOString(),
  }));
  
  // Batch in chunks of 100
  const chunkSize = 100;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    
    const { error } = await supabase
      .from('ncaab_ratings')
      .upsert(chunk, { onConflict: 'team_name' });
    
    if (error) {
      console.error('[Supabase] Error bulk saving ratings:', error);
      throw error;
    }
  }
  
  console.log(`[Supabase] Saved ${rows.length} ratings`);
}

/**
 * Initialize ratings from KenPom data (first-time setup)
 */
export async function initializeRatingsFromKenpom(
  kenpomRatings: Array<{ TeamName: string; AdjEM: number; ConfShort?: string }>,
  season: number = 2026
): Promise<void> {
  const supabase = getSupabaseClient();
  
  const rows = kenpomRatings.map(kp => ({
    team_name: kp.TeamName,
    kenpom_name: kp.TeamName,
    rating: kp.AdjEM,
    initial_rating: kp.AdjEM,
    games_processed: 0,
    conference: kp.ConfShort || null,
    season: season,
    updated_at: new Date().toISOString(),
  }));
  
  // Clear existing ratings for this season first
  await supabase
    .from('ncaab_ratings')
    .delete()
    .eq('season', season);
  
  // Insert in batches
  const chunkSize = 100;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    
    const { error } = await supabase
      .from('ncaab_ratings')
      .insert(chunk);
    
    if (error) {
      console.error('[Supabase] Error initializing ratings:', error);
      throw error;
    }
  }
  
  console.log(`[Supabase] Initialized ${rows.length} ratings from KenPom`);
}

// ============================================
// Game Adjustments Operations
// ============================================

/**
 * Check if a game has already been processed
 */
export async function isGameProcessed(gameId: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('ncaab_game_adjustments')
    .select('game_id')
    .eq('game_id', gameId)
    .single();
  
  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
    console.error('[Supabase] Error checking game:', error);
  }
  
  return !!data;
}

/**
 * Get all processed game IDs for a season
 */
export async function getProcessedGameIds(season: number = 2026): Promise<Set<string>> {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('ncaab_game_adjustments')
    .select('game_id')
    .eq('season', season);
  
  if (error) {
    console.error('[Supabase] Error loading processed games:', error);
    return new Set();
  }
  
  return new Set((data || []).map(row => row.game_id));
}

/**
 * Save a game adjustment
 */
export async function saveGameAdjustment(adjustment: GameAdjustment, season: number = 2026): Promise<void> {
  const supabase = getSupabaseClient();
  
  const { error } = await supabase
    .from('ncaab_game_adjustments')
    .upsert({
      game_id: adjustment.gameId,
      game_date: adjustment.date,
      home_team: adjustment.homeTeam,
      away_team: adjustment.awayTeam,
      is_neutral_site: adjustment.isNeutralSite,
      projected_spread: adjustment.projectedSpread,
      closing_spread: adjustment.closingSpread,
      closing_source: adjustment.closingSource,
      difference: adjustment.difference,
      adjustment: adjustment.adjustment,
      home_rating_before: adjustment.homeRatingBefore,
      home_rating_after: adjustment.homeRatingAfter,
      away_rating_before: adjustment.awayRatingBefore,
      away_rating_after: adjustment.awayRatingAfter,
      season: season,
      processed_at: new Date().toISOString(),
    }, {
      onConflict: 'game_id',
    });
  
  if (error) {
    console.error('[Supabase] Error saving adjustment:', error);
    throw error;
  }
}

/**
 * Load all adjustments for a season
 */
export async function loadAdjustments(season: number = 2026): Promise<GameAdjustment[]> {
  const supabase = getSupabaseClient();
  
  // Supabase has a default max of 1000 rows per request
  // Use pagination to get all adjustments
  const allAdjustments: GameAdjustment[] = [];
  const pageSize = 1000;
  let offset = 0;
  let hasMore = true;
  
  while (hasMore) {
    const { data, error } = await supabase
      .from('ncaab_game_adjustments')
      .select('*')
      .eq('season', season)
      .order('game_date', { ascending: true })
      .range(offset, offset + pageSize - 1);
    
    if (error) {
      console.error('[Supabase] Error loading adjustments:', error);
      break;
    }
    
    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      const mapped = data.map(row => ({
        gameId: row.game_id,
        date: row.game_date,
        homeTeam: row.home_team,
        awayTeam: row.away_team,
        isNeutralSite: row.is_neutral_site,
        projectedSpread: row.projected_spread,
        closingSpread: row.closing_spread,
        closingSource: row.closing_source as ClosingLineSource,
        difference: row.difference,
        adjustment: row.adjustment,
        homeRatingBefore: row.home_rating_before,
        homeRatingAfter: row.home_rating_after,
        awayRatingBefore: row.away_rating_before,
        awayRatingAfter: row.away_rating_after,
      }));
      
      allAdjustments.push(...mapped);
      offset += pageSize;
      
      // If we got less than pageSize, we've reached the end
      if (data.length < pageSize) {
        hasMore = false;
      }
    }
  }
  
  console.log(`[Supabase] Loaded ${allAdjustments.length} adjustments for season ${season}`);
  return allAdjustments;
}

// ============================================
// Closing Lines Cache Operations
// ============================================

/**
 * Get cached closing line for a game
 */
export async function getCachedClosingLine(gameId: string): Promise<DBClosingLine | null> {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('ncaab_closing_lines')
    .select('*')
    .eq('game_id', gameId)
    .single();
  
  if (error && error.code !== 'PGRST116') {
    console.error('[Supabase] Error getting cached line:', error);
  }
  
  return data || null;
}

/**
 * Cache a closing line
 */
export async function cacheClosingLine(
  gameId: string,
  oddsApiId: string | null,
  gameDate: string,
  homeTeam: string,
  awayTeam: string,
  closingSpread: number,
  closingSource: ClosingLineSource,
  bookmakers: string[]
): Promise<void> {
  const supabase = getSupabaseClient();
  
  const { error } = await supabase
    .from('ncaab_closing_lines')
    .upsert({
      game_id: gameId,
      odds_api_id: oddsApiId,
      game_date: gameDate,
      home_team: homeTeam,
      away_team: awayTeam,
      closing_spread: closingSpread,
      closing_source: closingSource,
      bookmakers: bookmakers,
      fetched_at: new Date().toISOString(),
    }, {
      onConflict: 'game_id',
    });
  
  if (error) {
    console.error('[Supabase] Error caching closing line:', error);
  }
}

// ============================================
// Config Operations
// ============================================

/**
 * Load ratings config
 */
export async function loadConfig(): Promise<DBRatingsConfig | null> {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('ncaab_ratings_config')
    .select('*')
    .eq('id', 1)
    .single();
  
  if (error) {
    console.error('[Supabase] Error loading config:', error);
    return null;
  }
  
  return data;
}

/**
 * Save ratings config
 */
export async function saveConfig(
  hca: number,
  closingSource: ClosingLineSource,
  season: number,
  lastProcessedDate?: string
): Promise<void> {
  const supabase = getSupabaseClient();
  
  const { error } = await supabase
    .from('ncaab_ratings_config')
    .upsert({
      id: 1,
      hca,
      closing_source: closingSource,
      season,
      last_processed_date: lastProcessedDate || null,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'id',
    });
  
  if (error) {
    console.error('[Supabase] Error saving config:', error);
    throw error;
  }
}

// ============================================
// Stats/Summary Operations
// ============================================

/**
 * Get summary statistics
 */
export async function getStats(season: number = 2026): Promise<{
  teamsCount: number;
  gamesProcessed: number;
  lastGameDate: string | null;
  firstGameDate: string | null;
}> {
  const supabase = getSupabaseClient();
  
  const [ratingsResult, latestGameResult, earliestGameResult] = await Promise.all([
    supabase
      .from('ncaab_ratings')
      .select('team_name', { count: 'exact' })
      .eq('season', season),
    supabase
      .from('ncaab_game_adjustments')
      .select('game_id, game_date', { count: 'exact' })
      .eq('season', season)
      .order('game_date', { ascending: false })
      .limit(1),
    supabase
      .from('ncaab_game_adjustments')
      .select('game_date')
      .eq('season', season)
      .order('game_date', { ascending: true })
      .limit(1),
  ]);
  
  return {
    teamsCount: ratingsResult.count || 0,
    gamesProcessed: latestGameResult.count || 0,
    lastGameDate: latestGameResult.data?.[0]?.game_date || null,
    firstGameDate: earliestGameResult.data?.[0]?.game_date || null,
  };
}

// ============================================
// Matching Logs Operations
// ============================================

export interface MatchingLog {
  gameId: string;
  gameDate: string;
  espnHome: string;
  espnAway: string;
  matchedHome: string | null;
  matchedAway: string | null;
  homeFound: boolean;
  awayFound: boolean;
  status: 'success' | 'home_not_found' | 'away_not_found' | 'both_not_found' | 'no_odds' | 'no_spread';
  skipReason: string | null;
  closingSpread: number | null;
}

/**
 * Save a matching log entry
 */
export async function saveMatchingLog(log: MatchingLog, season: number = 2026): Promise<void> {
  const supabase = getSupabaseClient();
  
  const { error } = await supabase
    .from('ncaab_matching_logs')
    .insert({
      game_id: log.gameId,
      game_date: log.gameDate,
      espn_home: log.espnHome,
      espn_away: log.espnAway,
      matched_home: log.matchedHome,
      matched_away: log.matchedAway,
      home_found: log.homeFound,
      away_found: log.awayFound,
      status: log.status,
      skip_reason: log.skipReason,
      closing_spread: log.closingSpread,
      season: season,
    });
  
  if (error) {
    console.error('[Supabase] Error saving matching log:', error);
  }
}

/**
 * Load matching logs for a season
 * By default only loads failed matches (actionable items)
 * Set onlyFailed=false to load all logs
 */
export async function loadMatchingLogs(season: number = 2026, onlyFailed: boolean = true): Promise<MatchingLog[]> {
  const supabase = getSupabaseClient();
  
  let query = supabase
    .from('ncaab_matching_logs')
    .select('*')
    .eq('season', season);
  
  // Only fetch failed matches by default (the ones you can act on)
  if (onlyFailed) {
    query = query.neq('status', 'success');
  } else {
    // Only limit when fetching all logs (success + failed)
    query = query.limit(2000);
  }
  
  const { data, error } = await query
    .order('game_date', { ascending: false });
  
  if (error) {
    console.error('[Supabase] Error loading matching logs:', error);
    return [];
  }
  
  return (data || []).map(row => ({
    gameId: row.game_id,
    gameDate: row.game_date,
    espnHome: row.espn_home,
    espnAway: row.espn_away,
    matchedHome: row.matched_home,
    matchedAway: row.matched_away,
    homeFound: row.home_found,
    awayFound: row.away_found,
    status: row.status,
    skipReason: row.skip_reason,
    closingSpread: row.closing_spread,
  }));
}

/**
 * Clear matching logs for a season
 */
export async function clearMatchingLogs(season: number = 2026): Promise<void> {
  const supabase = getSupabaseClient();
  
  const { error } = await supabase
    .from('ncaab_matching_logs')
    .delete()
    .eq('season', season);
  
  if (error) {
    console.error('[Supabase] Error clearing matching logs:', error);
  }
}

/**
 * Get matching log statistics
 */
export async function getMatchingLogStats(season: number = 2026): Promise<{
  total: number;
  success: number;
  homeNotFound: number;
  awayNotFound: number;
  bothNotFound: number;
  noOdds: number;
  noSpread: number;
}> {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('ncaab_matching_logs')
    .select('status')
    .eq('season', season);
  
  if (error || !data) {
    return { total: 0, success: 0, homeNotFound: 0, awayNotFound: 0, bothNotFound: 0, noOdds: 0, noSpread: 0 };
  }
  
  const stats = {
    total: data.length,
    success: 0,
    homeNotFound: 0,
    awayNotFound: 0,
    bothNotFound: 0,
    noOdds: 0,
    noSpread: 0,
  };
  
  for (const row of data) {
    switch (row.status) {
      case 'success': stats.success++; break;
      case 'home_not_found': stats.homeNotFound++; break;
      case 'away_not_found': stats.awayNotFound++; break;
      case 'both_not_found': stats.bothNotFound++; break;
      case 'no_odds': stats.noOdds++; break;
      case 'no_spread': stats.noSpread++; break;
    }
  }
  
  return stats;
}

// ============================================
// Team Override Operations
// ============================================

export interface TeamOverride {
  id?: number;
  sourceName: string;
  kenpomName: string;
  espnName?: string;      // ESPN display name for logo lookup
  oddsApiName?: string;   // Odds API team name for game matching
  source: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Load all team overrides
 */
export async function loadTeamOverrides(): Promise<TeamOverride[]> {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('ncaab_team_overrides')
    .select('*')
    .order('source_name');
  
  if (error) {
    console.error('[Supabase] Error loading team overrides:', error);
    return [];
  }
  
  return (data || []).map(row => ({
    id: row.id,
    sourceName: row.source_name,
    kenpomName: row.kenpom_name,
    espnName: row.espn_name,
    oddsApiName: row.odds_api_name,
    source: row.source,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Add or update a team override (upsert)
 */
export async function addTeamOverride(override: TeamOverride): Promise<TeamOverride | null> {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('ncaab_team_overrides')
    .upsert({
      source_name: override.sourceName,
      kenpom_name: override.kenpomName,
      espn_name: override.espnName || null,
      odds_api_name: override.oddsApiName || null,
      source: override.source || 'manual',
      notes: override.notes,
    }, {
      onConflict: 'source_name',
    })
    .select()
    .single();
  
  if (error) {
    console.error('[Supabase] Error adding team override:', error);
    return null;
  }
  
  return {
    id: data.id,
    sourceName: data.source_name,
    kenpomName: data.kenpom_name,
    espnName: data.espn_name,
    oddsApiName: data.odds_api_name,
    source: data.source,
    notes: data.notes,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * Update a team override
 */
export async function updateTeamOverride(id: number, override: Partial<TeamOverride>): Promise<boolean> {
  const supabase = getSupabaseClient();
  
  const updates: Record<string, unknown> = {};
  if (override.sourceName) updates.source_name = override.sourceName;
  if (override.kenpomName) updates.kenpom_name = override.kenpomName;
  // Only update optional fields if they have a truthy value (don't overwrite with empty/null)
  if (override.espnName) updates.espn_name = override.espnName;
  if (override.oddsApiName) updates.odds_api_name = override.oddsApiName;
  if (override.source) updates.source = override.source;
  if (override.notes) updates.notes = override.notes;
  
  const { error } = await supabase
    .from('ncaab_team_overrides')
    .update(updates)
    .eq('id', id);
  
  if (error) {
    console.error('[Supabase] Error updating team override:', error);
    return false;
  }
  
  return true;
}

/**
 * Delete a team override
 */
export async function deleteTeamOverride(id: number): Promise<boolean> {
  const supabase = getSupabaseClient();
  
  const { error } = await supabase
    .from('ncaab_team_overrides')
    .delete()
    .eq('id', id);
  
  if (error) {
    console.error('[Supabase] Error deleting team override:', error);
    return false;
  }
  
  return true;
}

/**
 * Build override lookup map (source_name -> kenpom_name)
 */
export async function buildOverrideMap(): Promise<Map<string, string>> {
  const overrides = await loadTeamOverrides();
  const map = new Map<string, string>();
  
  for (const override of overrides) {
    map.set(override.sourceName.toLowerCase(), override.kenpomName);
  }
  
  return map;
}

/**
 * Build Odds API override lookup map
 * Returns a map where keys are ESPN names (lowercase) and values are Odds API names
 */
export async function buildOddsApiOverrideMap(): Promise<Map<string, string>> {
  const overrides = await loadTeamOverrides();
  const map = new Map<string, string>();
  
  for (const override of overrides) {
    // Map ESPN name (or source_name) to Odds API name
    if (override.oddsApiName) {
      // Use source_name as the key (ESPN name)
      map.set(override.sourceName.toLowerCase(), override.oddsApiName.toLowerCase());
      // Also map espn_name if different
      if (override.espnName && override.espnName.toLowerCase() !== override.sourceName.toLowerCase()) {
        map.set(override.espnName.toLowerCase(), override.oddsApiName.toLowerCase());
      }
    }
  }
  
  return map;
}

// ============================================
// Odds API Teams Reference Table
// ============================================

/**
 * Save or update Odds API team names (batch upsert)
 */
export async function saveOddsApiTeams(teamNames: string[]): Promise<void> {
  if (teamNames.length === 0) return;
  
  const supabase = getSupabaseClient();
  const uniqueNames = [...new Set(teamNames)];
  
  // Batch upsert all teams at once
  const teamsToUpsert = uniqueNames.map(teamName => ({
    team_name: teamName,
    last_seen_at: new Date().toISOString(),
  }));
  
  const { error } = await supabase
    .from('ncaab_odds_api_teams')
    .upsert(teamsToUpsert, {
      onConflict: 'team_name',
    });
  
  if (error) {
    console.error('[Supabase] Error saving Odds API teams:', error);
  }
}

/**
 * Load all Odds API team names
 */
export async function loadOddsApiTeams(): Promise<string[]> {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('ncaab_odds_api_teams')
    .select('team_name')
    .order('team_name');
  
  if (error) {
    console.error('[Supabase] Error loading Odds API teams:', error);
    return [];
  }
  
  return (data || []).map(row => row.team_name);
}

// ============================================
// Non-D1 Games Tracking
// ============================================

export interface NonD1Game {
  id?: number;
  gameId: string;
  espnHome: string;
  espnAway: string;
  gameDate: string;
  notes?: string;
  createdAt?: string;
}

/**
 * Mark a game as non-D1 matchup
 */
export async function markGameAsNonD1(game: NonD1Game): Promise<boolean> {
  const supabase = getSupabaseClient();
  
  const { error } = await supabase
    .from('ncaab_non_d1_games')
    .upsert({
      game_id: game.gameId,
      espn_home: game.espnHome,
      espn_away: game.espnAway,
      game_date: game.gameDate,
      notes: game.notes || null,
    }, {
      onConflict: 'game_id',
    });
  
  if (error) {
    console.error('[Supabase] Error marking game as non-D1:', error);
    return false;
  }
  
  return true;
}

/**
 * Load all non-D1 game IDs
 */
export async function loadNonD1GameIds(): Promise<Set<string>> {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('ncaab_non_d1_games')
    .select('game_id');
  
  if (error) {
    console.error('[Supabase] Error loading non-D1 games:', error);
    return new Set();
  }
  
  return new Set((data || []).map(row => row.game_id));
}

/**
 * Load all non-D1 games with details
 */
export async function loadNonD1Games(): Promise<NonD1Game[]> {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('ncaab_non_d1_games')
    .select('*')
    .order('game_date', { ascending: false });
  
  if (error) {
    console.error('[Supabase] Error loading non-D1 games:', error);
    return [];
  }
  
  return (data || []).map(row => ({
    id: row.id,
    gameId: row.game_id,
    espnHome: row.espn_home,
    espnAway: row.espn_away,
    gameDate: row.game_date,
    notes: row.notes,
    createdAt: row.created_at,
  }));
}

/**
 * Remove a game from non-D1 list
 */
export async function removeNonD1Game(gameId: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  
  const { error } = await supabase
    .from('ncaab_non_d1_games')
    .delete()
    .eq('game_id', gameId);
  
  if (error) {
    console.error('[Supabase] Error removing non-D1 game:', error);
    return false;
  }
  
  return true;
}
