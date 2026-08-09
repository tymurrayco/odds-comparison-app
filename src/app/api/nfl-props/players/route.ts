// src/app/api/nfl-props/players/route.ts
// GET ?q=jacobs   → player search (name, position, latest team/season)
// GET ?playerId=… → all game-log rows for one player (client computes stats)

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  const playerId = searchParams.get('playerId');

  if (playerId) {
    const { data, error } = await supabase
      .from('nfl_player_game_logs')
      .select('*')
      .eq('player_id', playerId)
      .order('season', { ascending: true })
      .order('week', { ascending: true })
      .limit(400);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, games: data ?? [] });
  }

  if (q !== null) {
    if (q.trim().length < 2) return NextResponse.json({ success: true, players: [] });
    const { data, error } = await supabase
      .from('nfl_player_game_logs')
      .select('player_id, player_name, position, team, season')
      .ilike('player_name', `%${q.trim()}%`)
      .order('season', { ascending: false })
      .limit(300);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Distinct players, keeping the most recent team/season
    const seen = new Map<string, { player_id: string; player_name: string; position: string; team: string; last_season: number }>();
    for (const r of data ?? []) {
      if (!seen.has(r.player_id)) {
        seen.set(r.player_id, {
          player_id: r.player_id,
          player_name: r.player_name,
          position: r.position,
          team: r.team,
          last_season: r.season,
        });
      }
    }
    return NextResponse.json({ success: true, players: Array.from(seen.values()).slice(0, 20) });
  }

  return NextResponse.json({ error: 'q or playerId query param required' }, { status: 400 });
}
