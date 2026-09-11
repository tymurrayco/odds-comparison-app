// src/lib/nfl/totals/supabase.ts
// Supabase I/O for the NFL totals Ledger (DDL in sql/nfl_totals.sql).

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { NFL_SEASON } from '../constants';

let supabase: SupabaseClient | null = null;
function getClient(): SupabaseClient {
  if (!supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Supabase credentials missing');
    supabase = createClient(url, key);
  }
  return supabase;
}

const PAGE = 1000;

export interface TotalsTeam {
  teamName: string;
  espnId: string | null;
  espnAbbr: string | null;
  season: number;
  priorPace: number;
  priorOffPpp: number;
  priorDefPpp: number;
  marketTerm: number;
  initialMarketTerm: number;
  gamesProcessed: number;
  updatedAt: string;
}

export interface TotalsAdjustment {
  gameId: string;
  oddsApiId: string | null;
  gameDate: string;
  homeTeam: string;
  awayTeam: string;
  isNeutralSite: boolean;
  homePace: number; homeOffPpp: number; homeDefPpp: number; homeStatGames: number;
  awayPace: number; awayOffPpp: number; awayDefPpp: number; awayStatGames: number;
  playsExpected: number;
  homePtsFund: number;
  awayPtsFund: number;
  fundTotal: number;
  homeTermBefore: number;
  awayTermBefore: number;
  projectedTotal: number;
  closingTotal: number;
  closingSource: string;
  difference: number;
  adjustment: number;
  homeTermAfter: number;
  awayTermAfter: number;
  season: number;
}

export interface TotalsConfig {
  season: number;
  leagueAvgPace: number;
  leagueAvgPpp: number;
  blendK: number;
  priorRegress: number;
  seedLabel: string | null;
  lastProcessedDate: string | null;
  updatedAt: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

const toTeam = (r: any): TotalsTeam => ({
  teamName: r.team_name,
  espnId: r.espn_id,
  espnAbbr: r.espn_abbr,
  season: r.season,
  priorPace: Number(r.prior_pace),
  priorOffPpp: Number(r.prior_off_ppp),
  priorDefPpp: Number(r.prior_def_ppp),
  marketTerm: Number(r.market_term),
  initialMarketTerm: Number(r.initial_market_term),
  gamesProcessed: r.games_processed,
  updatedAt: r.updated_at,
});

export async function loadTotalsTeams(season: number = NFL_SEASON): Promise<Map<string, TotalsTeam>> {
  const { data, error } = await getClient()
    .from('nfl_totals_ratings')
    .select('*')
    .eq('season', season)
    .range(0, PAGE - 1);
  if (error) throw new Error(`loadTotalsTeams: ${error.message}`);
  const map = new Map<string, TotalsTeam>();
  for (const r of data ?? []) map.set(r.team_name, toTeam(r));
  return map;
}

export async function upsertTotalsTeams(teams: TotalsTeam[]): Promise<void> {
  if (teams.length === 0) return;
  const { error } = await getClient().from('nfl_totals_ratings').upsert(
    teams.map((t) => ({
      team_name: t.teamName,
      espn_id: t.espnId,
      espn_abbr: t.espnAbbr,
      season: t.season,
      prior_pace: t.priorPace,
      prior_off_ppp: t.priorOffPpp,
      prior_def_ppp: t.priorDefPpp,
      market_term: t.marketTerm,
      initial_market_term: t.initialMarketTerm,
      games_processed: t.gamesProcessed,
      updated_at: t.updatedAt,
    })),
    { onConflict: 'team_name,season' }
  );
  if (error) throw new Error(`upsertTotalsTeams: ${error.message}`);
}

const toAdj = (r: any): TotalsAdjustment => ({
  gameId: r.game_id,
  oddsApiId: r.odds_api_id,
  gameDate: r.game_date,
  homeTeam: r.home_team,
  awayTeam: r.away_team,
  isNeutralSite: r.is_neutral_site,
  homePace: Number(r.home_pace), homeOffPpp: Number(r.home_off_ppp), homeDefPpp: Number(r.home_def_ppp), homeStatGames: r.home_stat_games,
  awayPace: Number(r.away_pace), awayOffPpp: Number(r.away_off_ppp), awayDefPpp: Number(r.away_def_ppp), awayStatGames: r.away_stat_games,
  playsExpected: Number(r.plays_expected),
  homePtsFund: Number(r.home_pts_fund),
  awayPtsFund: Number(r.away_pts_fund),
  fundTotal: Number(r.fund_total),
  homeTermBefore: Number(r.home_term_before),
  awayTermBefore: Number(r.away_term_before),
  projectedTotal: Number(r.projected_total),
  closingTotal: Number(r.closing_total),
  closingSource: r.closing_source ?? '',
  difference: Number(r.difference),
  adjustment: Number(r.adjustment),
  homeTermAfter: Number(r.home_term_after),
  awayTermAfter: Number(r.away_term_after),
  season: r.season,
});

export async function loadTotalsAdjustments(season: number = NFL_SEASON): Promise<TotalsAdjustment[]> {
  const out: TotalsAdjustment[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await getClient()
      .from('nfl_totals_adjustments')
      .select('*')
      .eq('season', season)
      .order('game_date', { ascending: true })
      .order('game_id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`loadTotalsAdjustments: ${error.message}`);
    for (const r of data ?? []) out.push(toAdj(r));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export async function saveTotalsAdjustment(a: TotalsAdjustment): Promise<void> {
  const { error } = await getClient().from('nfl_totals_adjustments').upsert(
    {
      game_id: a.gameId,
      odds_api_id: a.oddsApiId,
      game_date: a.gameDate,
      home_team: a.homeTeam,
      away_team: a.awayTeam,
      is_neutral_site: a.isNeutralSite,
      home_pace: a.homePace, home_off_ppp: a.homeOffPpp, home_def_ppp: a.homeDefPpp, home_stat_games: a.homeStatGames,
      away_pace: a.awayPace, away_off_ppp: a.awayOffPpp, away_def_ppp: a.awayDefPpp, away_stat_games: a.awayStatGames,
      plays_expected: a.playsExpected,
      home_pts_fund: a.homePtsFund,
      away_pts_fund: a.awayPtsFund,
      fund_total: a.fundTotal,
      home_term_before: a.homeTermBefore,
      away_term_before: a.awayTermBefore,
      projected_total: a.projectedTotal,
      closing_total: a.closingTotal,
      closing_source: a.closingSource,
      difference: a.difference,
      adjustment: a.adjustment,
      home_term_after: a.homeTermAfter,
      away_term_after: a.awayTermAfter,
      season: a.season,
      processed_at: new Date().toISOString(),
    },
    { onConflict: 'game_id' }
  );
  if (error) throw new Error(`saveTotalsAdjustment(${a.gameId}): ${error.message}`);
}

export async function loadTotalsConfig(): Promise<TotalsConfig> {
  const { data, error } = await getClient().from('nfl_totals_config').select('*').eq('id', 1).limit(1);
  if (error) throw new Error(`loadTotalsConfig: ${error.message}`);
  const r = data?.[0];
  if (!r) {
    return {
      season: NFL_SEASON, leagueAvgPace: 61.5, leagueAvgPpp: 0.374, blendK: 4, priorRegress: 1 / 3,
      seedLabel: null, lastProcessedDate: null, updatedAt: null,
    };
  }
  return {
    season: r.season,
    leagueAvgPace: Number(r.league_avg_pace),
    leagueAvgPpp: Number(r.league_avg_ppp),
    blendK: Number(r.blend_k),
    priorRegress: Number(r.prior_regress),
    seedLabel: r.seed_label ?? null,
    lastProcessedDate: r.last_processed_date,
    updatedAt: r.updated_at ?? null,
  };
}

export async function saveTotalsConfig(c: TotalsConfig): Promise<void> {
  const { error } = await getClient().from('nfl_totals_config').upsert(
    {
      id: 1,
      season: c.season,
      league_avg_pace: c.leagueAvgPace,
      league_avg_ppp: c.leagueAvgPpp,
      blend_k: c.blendK,
      prior_regress: c.priorRegress,
      seed_label: c.seedLabel,
      last_processed_date: c.lastProcessedDate,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );
  if (error) throw new Error(`saveTotalsConfig: ${error.message}`);
}

/** Closing total on the spread sync's per-game line cache. */
export async function getCachedClosingTotal(gameId: string): Promise<{ total: number | null; oddsApiId: string | null; found: boolean }> {
  const { data, error } = await getClient()
    .from('nfl_closing_lines')
    .select('closing_total, odds_api_id')
    .eq('game_id', gameId)
    .limit(1);
  if (error) throw new Error(`getCachedClosingTotal: ${error.message}`);
  const r = data?.[0];
  if (!r) return { total: null, oddsApiId: null, found: false };
  return { total: r.closing_total === null ? null : Number(r.closing_total), oddsApiId: r.odds_api_id, found: true };
}

export async function setCachedClosingTotal(gameId: string, total: number | null): Promise<void> {
  const { error } = await getClient()
    .from('nfl_closing_lines')
    .update({ closing_total: total })
    .eq('game_id', gameId);
  if (error) throw new Error(`setCachedClosingTotal: ${error.message}`);
}
