// src/app/api/nfl-props/reference/route.ts
// GET  — stored SD-multiplier reference snapshot
// POST — recompute from nfl_player_game_logs (REG games) and store.
// Pulls logs paginated (PostgREST caps at 1000 rows per request).

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { computeReference } from '@/lib/props/reference';
import { PlayerGameLog } from '@/lib/props/markets';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PAGE = 1000;

export async function GET() {
  const { data, error } = await supabase
    .from('nfl_prop_reference')
    .select('*')
    .eq('key', 'default')
    .limit(1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const row = data?.[0];
  if (!row) return NextResponse.json({ success: true, reference: null });
  return NextResponse.json({ success: true, reference: row.reference, computedAt: row.computed_at });
}

export async function POST() {
  const logs: PlayerGameLog[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('nfl_player_game_logs')
      .select('*')
      .eq('season_type', 'REG')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    logs.push(...((data ?? []) as PlayerGameLog[]));
    if (!data || data.length < PAGE) break;
  }

  if (!logs.length) {
    return NextResponse.json({ error: 'No game logs — sync seasons first' }, { status: 400 });
  }

  const seasons = Array.from(new Set(logs.map((g) => g.season))).sort();
  const reference = computeReference(logs, seasons);

  const { error: upsertError } = await supabase
    .from('nfl_prop_reference')
    .upsert(
      { key: 'default', seasons, reference, computed_at: reference.computedAt },
      { onConflict: 'key' }
    );
  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

  return NextResponse.json({ success: true, reference, gameRows: logs.length });
}
