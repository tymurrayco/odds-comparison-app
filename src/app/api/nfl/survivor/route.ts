// src/app/api/nfl/survivor/route.ts
//
// GET  /api/nfl/survivor[?homeOnly=1][&season=]  -> the survivor plan
// POST /api/nfl/survivor { week, slot, team | null [, season] } -> save/clear a pick
// Picks live in nfl_survivor_picks (sql/nfl_survivor.sql).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { NFL_SEASON } from '@/lib/nfl/constants';
import { loadNflConfig, loadNflRatings } from '@/lib/nfl/supabase';
import { buildSurvivorPlan, fetchNflSeasonGames, picksRequired, SURVIVOR_WEEKS } from '@/lib/nfl/survivor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

async function loadPicks(season: number): Promise<{ picks: Array<{ week: number; slot: number; team: string }>; error: string | null }> {
  const { data, error } = await sb()
    .from('nfl_survivor_picks')
    .select('week, slot, team_name')
    .eq('season', season)
    .order('week', { ascending: true })
    .order('slot', { ascending: true });
  if (error) {
    // Table not created yet — plan still renders, picks just can't save
    return { picks: [], error: error.message };
  }
  return { picks: (data ?? []).map((r) => ({ week: r.week, slot: r.slot, team: r.team_name })), error: null };
}

export async function GET(request: NextRequest) {
  try {
    const season = Number(request.nextUrl.searchParams.get('season')) || NFL_SEASON;
    const homeOnly = request.nextUrl.searchParams.get('homeOnly') === '1';
    const [config, ratings, games, { picks, error }] = await Promise.all([
      loadNflConfig(),
      loadNflRatings(season),
      fetchNflSeasonGames(season),
      loadPicks(season),
    ]);
    const plan = buildSurvivorPlan(season, games, ratings, config.hfaDefault, picks, homeOnly);
    return NextResponse.json({ success: true, ...plan, picksError: error });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const season: number = body.season ?? NFL_SEASON;
    const week = Number(body.week);
    const slot = Number(body.slot ?? 1);
    const team: string | null = body.team ? String(body.team) : null;
    if (!Number.isInteger(week) || week < 1 || week > SURVIVOR_WEEKS) throw new Error('week must be 1–18');
    if (!Number.isInteger(slot) || slot < 1 || slot > picksRequired(week)) {
      throw new Error(`week ${week} takes ${picksRequired(week)} pick${picksRequired(week) > 1 ? 's' : ''}`);
    }
    if (team === null) {
      const { error } = await sb().from('nfl_survivor_picks').delete().eq('season', season).eq('week', week).eq('slot', slot);
      if (error) throw new Error(error.message);
      return NextResponse.json({ success: true, cleared: { week, slot } });
    }
    // A team is used once for the whole contest
    const { data: dupes, error: dupeErr } = await sb()
      .from('nfl_survivor_picks')
      .select('week, slot')
      .eq('season', season)
      .eq('team_name', team);
    if (dupeErr) throw new Error(dupeErr.message);
    const other = (dupes ?? []).find((d) => !(d.week === week && d.slot === slot));
    if (other) throw new Error(`${team} is already used in week ${other.week}`);
    const { error } = await sb()
      .from('nfl_survivor_picks')
      .upsert({ season, week, slot, team_name: team, updated_at: new Date().toISOString() }, { onConflict: 'season,week,slot' });
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, saved: { week, slot, team } });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
