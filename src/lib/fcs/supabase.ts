// src/lib/fcs/supabase.ts

/**
 * Supabase I/O for the FCS ratings system.
 * Tables: fcs_ratings, fcs_game_adjustments, fcs_closing_lines, fcs_ratings_config
 * (DDL in sql/fcs_ratings.sql).
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { FCS_DEFAULT_HFA, FCS_SEASON } from './constants';
import {
  FcsClosingLine,
  FcsConfig,
  FcsGameAdjustment,
  FcsTeamRating,
} from './types';

let supabase: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Supabase credentials missing');
    supabase = createClient(url, key);
  }
  return supabase;
}

const PAGE = 1000;

// ---------- ratings ----------

interface RatingRow {
  team_name: string;
  massey_name: string;
  espn_name: string | null;
  espn_id: string | null;
  conference: string | null;
  rating: number;
  initial_rating: number;
  hfa: number | null;
  games_processed: number;
  season: number;
  updated_at: string;
}

function toRating(r: RatingRow): FcsTeamRating {
  return {
    teamName: r.team_name,
    masseyName: r.massey_name,
    espnName: r.espn_name,
    espnId: r.espn_id,
    conference: r.conference,
    rating: Number(r.rating),
    initialRating: Number(r.initial_rating),
    hfa: r.hfa === null ? null : Number(r.hfa),
    gamesProcessed: r.games_processed,
    season: r.season,
    updatedAt: r.updated_at,
  };
}

export async function loadFcsRatings(
  season: number = FCS_SEASON
): Promise<Map<string, FcsTeamRating>> {
  const { data, error } = await getClient()
    .from('fcs_ratings')
    .select('*')
    .eq('season', season)
    .order('rating', { ascending: false })
    .range(0, PAGE - 1);
  if (error) throw new Error(`loadFcsRatings: ${error.message}`);
  const map = new Map<string, FcsTeamRating>();
  for (const row of (data ?? []) as RatingRow[]) {
    map.set(row.team_name, toRating(row));
  }
  return map;
}

export async function upsertFcsRatings(ratings: FcsTeamRating[]): Promise<void> {
  if (ratings.length === 0) return;
  const rows = ratings.map((r) => ({
    team_name: r.teamName,
    massey_name: r.masseyName,
    espn_name: r.espnName,
    espn_id: r.espnId,
    conference: r.conference,
    rating: r.rating,
    initial_rating: r.initialRating,
    hfa: r.hfa,
    games_processed: r.gamesProcessed,
    season: r.season,
    updated_at: r.updatedAt,
  }));
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await getClient()
      .from('fcs_ratings')
      .upsert(rows.slice(i, i + 100), { onConflict: 'team_name,season' });
    if (error) throw new Error(`upsertFcsRatings: ${error.message}`);
  }
}

// ---------- adjustments ----------

interface AdjustmentRow {
  game_id: string;
  odds_api_id: string | null;
  game_date: string;
  home_team: string;
  away_team: string;
  is_neutral_site: boolean;
  hfa_applied: number;
  projected_spread: number;
  closing_spread: number;
  closing_source: string | null;
  difference: number;
  adjustment: number;
  home_rating_before: number;
  home_rating_after: number;
  away_rating_before: number;
  away_rating_after: number;
  season: number;
}

function toAdjustment(r: AdjustmentRow): FcsGameAdjustment {
  return {
    gameId: r.game_id,
    oddsApiId: r.odds_api_id,
    gameDate: r.game_date,
    homeTeam: r.home_team,
    awayTeam: r.away_team,
    isNeutralSite: r.is_neutral_site,
    hfaApplied: Number(r.hfa_applied),
    projectedSpread: Number(r.projected_spread),
    closingSpread: Number(r.closing_spread),
    closingSource: r.closing_source ?? '',
    difference: Number(r.difference),
    adjustment: Number(r.adjustment),
    homeRatingBefore: Number(r.home_rating_before),
    homeRatingAfter: Number(r.home_rating_after),
    awayRatingBefore: Number(r.away_rating_before),
    awayRatingAfter: Number(r.away_rating_after),
    season: r.season,
  };
}

/** All processed game ids for a season. Throws rather than returning a partial set. */
export async function getProcessedFcsGameIds(
  season: number = FCS_SEASON
): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await getClient()
      .from('fcs_game_adjustments')
      .select('game_id')
      .eq('season', season)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`getProcessedFcsGameIds: ${error.message}`);
    for (const row of data ?? []) ids.add(row.game_id);
    if (!data || data.length < PAGE) break;
  }
  return ids;
}

/** Full season ledger, chronological (game_id tiebreak keeps replays stable). */
export async function loadFcsAdjustments(
  season: number = FCS_SEASON
): Promise<FcsGameAdjustment[]> {
  const out: FcsGameAdjustment[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await getClient()
      .from('fcs_game_adjustments')
      .select('*')
      .eq('season', season)
      .order('game_date', { ascending: true })
      .order('game_id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`loadFcsAdjustments: ${error.message}`);
    for (const row of (data ?? []) as AdjustmentRow[]) out.push(toAdjustment(row));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** Latest game_date in the ledger — the durable out-of-order reference
 *  (config.last_processed_date can go stale if a sync crashes mid-run). */
export async function getMaxFcsAdjustmentDate(
  season: number = FCS_SEASON
): Promise<string | null> {
  const { data, error } = await getClient()
    .from('fcs_game_adjustments')
    .select('game_date')
    .eq('season', season)
    .order('game_date', { ascending: false })
    .limit(1);
  if (error) throw new Error(`getMaxFcsAdjustmentDate: ${error.message}`);
  return data?.[0]?.game_date?.substring(0, 10) ?? null;
}

export async function saveFcsAdjustment(adj: FcsGameAdjustment): Promise<void> {
  const { error } = await getClient()
    .from('fcs_game_adjustments')
    .upsert(
      {
        game_id: adj.gameId,
        odds_api_id: adj.oddsApiId,
        game_date: adj.gameDate,
        home_team: adj.homeTeam,
        away_team: adj.awayTeam,
        is_neutral_site: adj.isNeutralSite,
        hfa_applied: adj.hfaApplied,
        projected_spread: adj.projectedSpread,
        closing_spread: adj.closingSpread,
        closing_source: adj.closingSource,
        difference: adj.difference,
        adjustment: adj.adjustment,
        home_rating_before: adj.homeRatingBefore,
        home_rating_after: adj.homeRatingAfter,
        away_rating_before: adj.awayRatingBefore,
        away_rating_after: adj.awayRatingAfter,
        season: adj.season,
        processed_at: new Date().toISOString(),
      },
      { onConflict: 'game_id' }
    );
  if (error) throw new Error(`saveFcsAdjustment(${adj.gameId}): ${error.message}`);
}

// ---------- closing line cache ----------

export async function getCachedFcsClosingLine(
  gameId: string
): Promise<FcsClosingLine | null> {
  const { data, error } = await getClient()
    .from('fcs_closing_lines')
    .select('*')
    .eq('game_id', gameId)
    .limit(1);
  if (error) throw new Error(`getCachedFcsClosingLine: ${error.message}`);
  const row = data?.[0];
  if (!row) return null;
  return toClosingLine(row);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toClosingLine(row: any): FcsClosingLine {
  return {
    gameId: row.game_id,
    oddsApiId: row.odds_api_id,
    gameDate: row.game_date,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    isNeutralSite: row.is_neutral_site === true,
    closingSpread: row.closing_spread === null ? null : Number(row.closing_spread),
    closingSource: row.closing_source,
    bookmakers: row.bookmakers,
  };
}

/** Cached lines still waiting on a spread (candidates for manual entry). */
export async function loadUnlinedFcsGames(limit = 100): Promise<FcsClosingLine[]> {
  const { data, error } = await getClient()
    .from('fcs_closing_lines')
    .select('*')
    .is('closing_spread', null)
    .order('game_date', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`loadUnlinedFcsGames: ${error.message}`);
  return (data ?? []).map(toClosingLine);
}

/** Cached lines that HAVE a spread (manual or fetched) — sync processes any
 *  of these whose game_id is not yet in the adjustments ledger. */
export async function loadLinedFcsClosingLines(): Promise<FcsClosingLine[]> {
  const out: FcsClosingLine[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await getClient()
      .from('fcs_closing_lines')
      .select('*')
      .not('closing_spread', 'is', null)
      .order('game_date', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`loadLinedFcsClosingLines: ${error.message}`);
    out.push(...(data ?? []).map(toClosingLine));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** Set a manual closing spread on an existing cache row. */
export async function setManualFcsClosingLine(
  gameId: string,
  closingSpread: number
): Promise<FcsClosingLine> {
  const { data, error } = await getClient()
    .from('fcs_closing_lines')
    .update({
      closing_spread: closingSpread,
      closing_source: 'Manual',
      fetched_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)
    .select();
  if (error) throw new Error(`setManualFcsClosingLine: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(`No cached game with id ${gameId} — run a sync first so the game is registered`);
  }
  return toClosingLine(data[0]);
}

export async function saveFcsClosingLine(line: FcsClosingLine): Promise<void> {
  const { error } = await getClient()
    .from('fcs_closing_lines')
    .upsert(
      {
        game_id: line.gameId,
        odds_api_id: line.oddsApiId,
        game_date: line.gameDate,
        home_team: line.homeTeam,
        away_team: line.awayTeam,
        is_neutral_site: line.isNeutralSite,
        closing_spread: line.closingSpread,
        closing_source: line.closingSource,
        bookmakers: line.bookmakers,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'game_id' }
    );
  if (error) throw new Error(`saveFcsClosingLine(${line.gameId}): ${error.message}`);
}

// ---------- config ----------

export async function loadFcsConfig(): Promise<FcsConfig> {
  const { data, error } = await getClient()
    .from('fcs_ratings_config')
    .select('*')
    .eq('id', 1)
    .limit(1);
  if (error) throw new Error(`loadFcsConfig: ${error.message}`);
  const row = data?.[0];
  if (!row) {
    return {
      hfaDefault: FCS_DEFAULT_HFA,
      closingSource: 'us_average',
      season: FCS_SEASON,
      lastProcessedDate: null,
    };
  }
  return {
    hfaDefault: Number(row.hfa_default),
    closingSource: row.closing_source,
    season: row.season,
    lastProcessedDate: row.last_processed_date,
  };
}

export async function saveFcsConfig(config: FcsConfig): Promise<void> {
  const { error } = await getClient()
    .from('fcs_ratings_config')
    .upsert(
      {
        id: 1,
        hfa_default: config.hfaDefault,
        closing_source: config.closingSource,
        season: config.season,
        last_processed_date: config.lastProcessedDate,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
  if (error) throw new Error(`saveFcsConfig: ${error.message}`);
}
