// src/lib/kenpom/supabase.ts

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { KenpomGame } from './types';

let supabase: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error('Missing Supabase environment variables');
    }
    supabase = createClient(url, key);
  }
  return supabase;
}

// ============================================
// Save / Upsert
// ============================================

export async function saveKenpomGames(games: KenpomGame[]): Promise<void> {
  if (games.length === 0) return;

  const client = getClient();
  const chunkSize = 100;

  for (let i = 0; i < games.length; i += chunkSize) {
    const chunk = games.slice(i, i + chunkSize);

    const rows = chunk.map(g => ({
      kenpom_game_id: g.kenpom_game_id,
      game_date: g.game_date,
      season: g.season,
      home_team: g.home_team,
      away_team: g.away_team,
      predicted_home_score: g.predicted_home_score,
      predicted_away_score: g.predicted_away_score,
      home_q1: g.home_q1,
      home_q2: g.home_q2,
      home_q3: g.home_q3,
      home_q4: g.home_q4,
      home_total: g.home_total,
      away_q1: g.away_q1,
      away_q2: g.away_q2,
      away_q3: g.away_q3,
      away_q4: g.away_q4,
      away_total: g.away_total,
      has_predictions: g.has_predictions,
      has_box_score: g.has_box_score,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await client
      .from('ncaab_kenpom_games')
      .upsert(rows, { onConflict: 'kenpom_game_id' });

    if (error) {
      console.error(`Upsert error (chunk ${i / chunkSize + 1}):`, error.message);
      throw new Error(`Failed to save kenpom games: ${error.message}`);
    }
  }

  console.log(`Saved ${games.length} kenpom games`);
}

// ============================================
// Load
// ============================================

export async function loadKenpomGames(options: {
  season?: number;
  startDate?: string;
  endDate?: string;
}): Promise<KenpomGame[]> {
  const client = getClient();
  const allRows: KenpomGame[] = [];
  const pageSize = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    let query = client
      .from('ncaab_kenpom_games')
      .select('*')
      .order('game_date', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (options.season) {
      query = query.eq('season', options.season);
    }
    if (options.startDate) {
      query = query.gte('game_date', options.startDate);
    }
    if (options.endDate) {
      query = query.lte('game_date', options.endDate);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to load kenpom games: ${error.message}`);
    }

    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allRows.push(...(data as KenpomGame[]));
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        offset += pageSize;
      }
    }
  }

  return allRows;
}
