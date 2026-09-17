// src/app/api/nfl/survivor/route.ts
//
// GET  /api/nfl/survivor[?entry=main][&homeOnly=1][&season=]  -> the survivor plan for one entry
// POST /api/nfl/survivor { week, slot, team | null [, entry, season] } -> save/clear a pick
// POST /api/nfl/survivor { action: 'createEntry', entry, label, doubleWeeks[] [, season] } -> new entry
//
// Picks live in nfl_survivor_picks, entries (one per league, each with its
// own double-pick weeks) in nfl_survivor_entries (sql/nfl_survivor.sql +
// sql/nfl_survivor_entries.sql). Before the entries migration runs, the
// route behaves as a single 'main' entry with the Splash rules.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { NFL_SEASON } from '@/lib/nfl/constants';
import { loadNflConfig, loadNflRatings } from '@/lib/nfl/supabase';
import {
  buildSurvivorPlan,
  DEFAULT_RULES,
  fetchNflSeasonGames,
  OtherEntryPick,
  picksRequired,
  SurvivorEntry,
} from '@/lib/nfl/survivor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const LEGACY_ENTRY: SurvivorEntry = { entry: 'main', label: 'Splash × Polymarket', rules: DEFAULT_RULES };

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

interface PickRow { entry: string; week: number; slot: number; team: string }

/** Entries for the season; `legacy` = entries table not there yet (single 'main' entry, no entry column). */
async function loadEntries(season: number): Promise<{ entries: SurvivorEntry[]; legacy: boolean; error: string | null }> {
  const { data, error } = await sb()
    .from('nfl_survivor_entries')
    .select('entry, label, double_pick_weeks, weeks')
    .eq('season', season)
    .order('created_at', { ascending: true });
  if (error) return { entries: [LEGACY_ENTRY], legacy: true, error: error.message };
  const entries = (data ?? []).map((r) => ({
    entry: r.entry as string,
    label: r.label as string,
    rules: {
      doubleWeeks: [...((r.double_pick_weeks as number[] | null) ?? [])].sort((a, b) => a - b),
      weeks: (r.weeks as number) || DEFAULT_RULES.weeks,
    },
  }));
  return { entries: entries.length ? entries : [LEGACY_ENTRY], legacy: false, error: null };
}

async function loadPicks(season: number, legacy: boolean): Promise<{ picks: PickRow[]; error: string | null }> {
  const cols = legacy ? 'week, slot, team_name' : 'entry, week, slot, team_name';
  const { data, error } = await sb()
    .from('nfl_survivor_picks')
    .select(cols)
    .eq('season', season)
    .order('week', { ascending: true })
    .order('slot', { ascending: true });
  if (error) {
    // Table not created yet — plan still renders, picks just can't save
    return { picks: [], error: error.message };
  }
  const rows = (data ?? []) as unknown as Array<{ entry?: string; week: number; slot: number; team_name: string }>;
  return { picks: rows.map((r) => ({ entry: r.entry ?? 'main', week: r.week, slot: r.slot, team: r.team_name })), error: null };
}

export async function GET(request: NextRequest) {
  try {
    const season = Number(request.nextUrl.searchParams.get('season')) || NFL_SEASON;
    const homeOnly = request.nextUrl.searchParams.get('homeOnly') === '1';
    const wanted = request.nextUrl.searchParams.get('entry');
    const [config, ratings, games, { entries, legacy, error: entriesError }] = await Promise.all([
      loadNflConfig(),
      loadNflRatings(season),
      fetchNflSeasonGames(season),
      loadEntries(season),
    ]);
    const entry = entries.find((e) => e.entry === wanted) ?? entries[0];
    const { picks, error } = await loadPicks(season, legacy);
    const mine = picks.filter((p) => p.entry === entry.entry).map(({ week, slot, team }) => ({ week, slot, team }));
    const labelOf = new Map(entries.map((e) => [e.entry, e.label]));
    const others: OtherEntryPick[] = picks
      .filter((p) => p.entry !== entry.entry)
      .map((p) => ({ entry: p.entry, label: labelOf.get(p.entry) ?? p.entry, week: p.week, team: p.team }));
    const plan = buildSurvivorPlan(season, games, ratings, config.hfaDefault, mine, homeOnly, entry, others);
    return NextResponse.json({
      success: true,
      ...plan,
      entries: entries.map((e) => ({ entry: e.entry, label: e.label, rules: e.rules })),
      picksError: error,
      entriesError: legacy ? entriesError : null,
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const season: number = body.season ?? NFL_SEASON;

    if (body.action === 'createEntry') {
      const key = String(body.entry ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const label = String(body.label ?? '').trim();
      const doubleWeeks = Array.isArray(body.doubleWeeks)
        ? [...new Set<number>((body.doubleWeeks as unknown[]).map(Number).filter((w) => Number.isInteger(w) && w >= 1 && w <= 18))].sort((a, b) => a - b)
        : [];
      if (!key) throw new Error('entry key is required');
      if (!label) throw new Error('label is required');
      const { error } = await sb()
        .from('nfl_survivor_entries')
        .insert({ season, entry: key, label, double_pick_weeks: doubleWeeks, weeks: 18 });
      if (error) throw new Error(/does not exist|Could not find the table/i.test(error.message) ? 'Run sql/nfl_survivor_entries.sql first' : error.message);
      return NextResponse.json({ success: true, created: { entry: key, label, doubleWeeks } });
    }

    const { entries, legacy } = await loadEntries(season);
    const entryKey = String(body.entry ?? entries[0].entry);
    const entry = entries.find((e) => e.entry === entryKey);
    if (!entry) throw new Error(`unknown entry "${entryKey}"`);
    const week = Number(body.week);
    const slot = Number(body.slot ?? 1);
    const team: string | null = body.team ? String(body.team) : null;
    if (!Number.isInteger(week) || week < 1 || week > entry.rules.weeks) throw new Error(`week must be 1–${entry.rules.weeks}`);
    const need = picksRequired(week, entry.rules);
    if (!Number.isInteger(slot) || slot < 1 || slot > need) {
      throw new Error(`week ${week} takes ${need} pick${need > 1 ? 's' : ''} in ${entry.label}`);
    }
    if (team === null) {
      let q = sb().from('nfl_survivor_picks').delete().eq('season', season).eq('week', week).eq('slot', slot);
      if (!legacy) q = q.eq('entry', entry.entry);
      const { error } = await q;
      if (error) throw new Error(error.message);
      return NextResponse.json({ success: true, cleared: { entry: entry.entry, week, slot } });
    }
    // A team is used once for the whole contest (per entry)
    let dq = sb().from('nfl_survivor_picks').select('week, slot').eq('season', season).eq('team_name', team);
    if (!legacy) dq = dq.eq('entry', entry.entry);
    const { data: dupes, error: dupeErr } = await dq;
    if (dupeErr) throw new Error(dupeErr.message);
    const other = (dupes ?? []).find((d) => !(d.week === week && d.slot === slot));
    if (other) throw new Error(`${team} is already used in week ${other.week} (${entry.label})`);
    const row: Record<string, unknown> = { season, week, slot, team_name: team, updated_at: new Date().toISOString() };
    if (!legacy) row.entry = entry.entry;
    const { error } = await sb()
      .from('nfl_survivor_picks')
      .upsert(row, { onConflict: legacy ? 'season,week,slot' : 'season,entry,week,slot' });
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, saved: { entry: entry.entry, week, slot, team } });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
