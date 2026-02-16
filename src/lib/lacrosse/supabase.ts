// src/lib/lacrosse/supabase.ts

import { getSupabaseClient } from '@/lib/ratings/supabase';
import { TeamRating, GameAdjustment, ClosingLineSource, TeamOverride } from './types';

// ============================================
// DB Row Types
// ============================================

export interface DBTeamRating {
  team_name: string;
  massey_name: string;
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

export interface DBRatingsConfig {
  id: number;
  hca: number;
  closing_source: string;
  season: number;
  last_processed_date: string | null;
  updated_at: string;
}

// ============================================
// Ratings Operations
// ============================================

export async function loadRatings(season: number = 2026): Promise<Map<string, TeamRating>> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('lacrosse_ratings')
    .select('*')
    .eq('season', season)
    .order('rating', { ascending: false });

  if (error) {
    console.error('[Lacrosse Supabase] Error loading ratings:', error);
    throw error;
  }

  const ratings = new Map<string, TeamRating>();

  for (const row of data || []) {
    ratings.set(row.team_name, {
      teamName: row.team_name,
      masseyName: row.massey_name,
      rating: row.rating,
      initialRating: row.initial_rating,
      gamesProcessed: row.games_processed,
      conference: row.conference,
      lastUpdated: row.updated_at,
    });
  }

  return ratings;
}

export async function saveRatings(ratings: Map<string, TeamRating>, season: number = 2026): Promise<void> {
  const supabase = getSupabaseClient();

  const rows = Array.from(ratings.values()).map(rating => ({
    team_name: rating.teamName,
    massey_name: rating.masseyName,
    rating: rating.rating,
    initial_rating: rating.initialRating,
    games_processed: rating.gamesProcessed,
    conference: rating.conference,
    season: season,
    updated_at: new Date().toISOString(),
  }));

  const chunkSize = 100;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);

    const { error } = await supabase
      .from('lacrosse_ratings')
      .upsert(chunk, { onConflict: 'team_name,season' });

    if (error) {
      console.error('[Lacrosse Supabase] Error bulk saving ratings:', error);
      throw error;
    }
  }

  console.log(`[Lacrosse Supabase] Saved ${rows.length} ratings`);
}

export async function initializeFromMassey(
  masseyRatings: Array<{ Team: string; Rating: number; Conf?: string }>,
  season: number = 2026
): Promise<void> {
  const supabase = getSupabaseClient();

  const rows = masseyRatings.map(mr => ({
    team_name: mr.Team,
    massey_name: mr.Team,
    rating: mr.Rating,
    initial_rating: mr.Rating,
    games_processed: 0,
    conference: mr.Conf || null,
    season: season,
    updated_at: new Date().toISOString(),
  }));

  // Clear existing ratings for this season first
  await supabase
    .from('lacrosse_ratings')
    .delete()
    .eq('season', season);

  // Insert in batches
  const chunkSize = 100;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);

    const { error } = await supabase
      .from('lacrosse_ratings')
      .insert(chunk);

    if (error) {
      console.error('[Lacrosse Supabase] Error initializing ratings:', error);
      throw error;
    }
  }

  console.log(`[Lacrosse Supabase] Initialized ${rows.length} ratings from Massey`);
}

// ============================================
// Config Operations
// ============================================

export async function loadConfig(): Promise<DBRatingsConfig | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('lacrosse_ratings_config')
    .select('*')
    .eq('id', 1)
    .single();

  if (error) {
    console.error('[Lacrosse Supabase] Error loading config:', error);
    return null;
  }

  return data;
}

export async function saveConfig(
  hca: number,
  closingSource: ClosingLineSource,
  season: number,
  lastProcessedDate?: string
): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from('lacrosse_ratings_config')
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
    console.error('[Lacrosse Supabase] Error saving config:', error);
    throw error;
  }
}

// ============================================
// Single Rating Save
// ============================================

export async function saveRating(rating: TeamRating, season: number = 2026): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from('lacrosse_ratings')
    .upsert({
      team_name: rating.teamName,
      massey_name: rating.masseyName,
      rating: rating.rating,
      initial_rating: rating.initialRating,
      games_processed: rating.gamesProcessed,
      conference: rating.conference,
      season: season,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'team_name,season',
    });

  if (error) {
    console.error('[Lacrosse Supabase] Error saving rating:', error);
    throw error;
  }
}

// ============================================
// Game Adjustments Operations
// ============================================

export async function getProcessedGameIds(season: number = 2026): Promise<Set<string>> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('lacrosse_game_adjustments')
    .select('game_id')
    .eq('season', season);

  if (error) {
    console.error('[Lacrosse Supabase] Error loading processed games:', error);
    return new Set();
  }

  return new Set((data || []).map(row => row.game_id));
}

export async function saveGameAdjustment(adjustment: GameAdjustment, season: number = 2026): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from('lacrosse_game_adjustments')
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
    console.error('[Lacrosse Supabase] Error saving adjustment:', error);
    throw error;
  }
}

export async function loadAdjustments(season: number = 2026): Promise<GameAdjustment[]> {
  const supabase = getSupabaseClient();

  const allAdjustments: GameAdjustment[] = [];
  const pageSize = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('lacrosse_game_adjustments')
      .select('*')
      .eq('season', season)
      .order('game_date', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error('[Lacrosse Supabase] Error loading adjustments:', error);
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

      if (data.length < pageSize) {
        hasMore = false;
      }
    }
  }

  console.log(`[Lacrosse Supabase] Loaded ${allAdjustments.length} adjustments for season ${season}`);
  return allAdjustments;
}

// ============================================
// Stats/Summary Operations
// ============================================

export async function getStats(season: number = 2026): Promise<{
  teamsCount: number;
  gamesProcessed: number;
  lastGameDate: string | null;
  firstGameDate: string | null;
}> {
  const supabase = getSupabaseClient();

  const [ratingsResult, latestGameResult, earliestGameResult] = await Promise.all([
    supabase
      .from('lacrosse_ratings')
      .select('team_name', { count: 'exact' })
      .eq('season', season),
    supabase
      .from('lacrosse_game_adjustments')
      .select('game_id, game_date', { count: 'exact' })
      .eq('season', season)
      .order('game_date', { ascending: false })
      .limit(1),
    supabase
      .from('lacrosse_game_adjustments')
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
// Team Override Operations
// ============================================

export async function loadTeamOverrides(): Promise<TeamOverride[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('lacrosse_team_overrides')
    .select('*')
    .order('source_name');

  if (error) {
    console.error('[Lacrosse Supabase] Error loading team overrides:', error);
    return [];
  }

  return (data || []).map(row => ({
    id: row.id,
    sourceName: row.source_name,
    masseyName: row.massey_name,
    espnName: row.espn_name,
    oddsApiName: row.odds_api_name,
    source: row.source,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}
