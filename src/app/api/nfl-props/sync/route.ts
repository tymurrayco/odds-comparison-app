// src/app/api/nfl-props/sync/route.ts
// POST ?season=2025 — download that season's nflverse weekly stats and upsert
// into nfl_player_game_logs (one season per call to stay under Vercel's 60s).
// GET — row counts per season for the admin panel.

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fetchSeasonLogs } from '@/lib/props/nflverse';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CHUNK = 500;

export async function GET() {
  // Row counts per season (head:true count avoids pulling rows)
  const seasons: { season: number; rows: number }[] = [];
  for (let season = 2022; season <= 2026; season++) {
    const { count, error } = await supabase
      .from('nfl_player_game_logs')
      .select('*', { count: 'exact', head: true })
      .eq('season', season);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (count) seasons.push({ season, rows: count });
  }
  return NextResponse.json({ success: true, seasons });
}

export async function POST(request: Request) {
  const seasonParam = new URL(request.url).searchParams.get('season');
  const season = Number(seasonParam);
  if (!Number.isInteger(season) || season < 2000 || season > 2100) {
    return NextResponse.json({ error: 'season query param required (e.g. ?season=2025)' }, { status: 400 });
  }

  let logs;
  try {
    logs = await fetchSeasonLogs(season);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Download failed' }, { status: 502 });
  }
  if (!logs.length) {
    return NextResponse.json({ error: `No usable rows in nflverse file for ${season}` }, { status: 502 });
  }

  for (let i = 0; i < logs.length; i += CHUNK) {
    const { error } = await supabase
      .from('nfl_player_game_logs')
      .upsert(logs.slice(i, i + CHUNK), { onConflict: 'player_id,season,week,season_type' });
    if (error) {
      return NextResponse.json(
        { error: `Upsert failed at row ${i}: ${error.message}`, inserted: i },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ success: true, season, rows: logs.length });
}
