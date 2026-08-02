// src/app/api/power-ratings/route.ts
// CRUD for power_rating_sets — one row per (sport, source, season), ratings as JSONB.

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { PowerRatingRow, slugifySource, matchOddsNameToTeam } from '@/lib/powerRatings';

export const dynamic = 'force-dynamic';

const DEFAULT_HFA = 2.5;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const teamsParam = searchParams.get('teams');

  if (teamsParam) {
    // Matchup mode: ?teams=<away odds name>,<home odds name>
    const [awayName, homeName] = teamsParam.split(',').map((s) => s.trim());
    if (!awayName || !homeName) {
      return NextResponse.json({ error: 'teams must be "away,home"' }, { status: 400 });
    }
    const source = searchParams.get('source') ?? 'brad_powers';
    const { data, error } = await supabase
      .from('power_rating_sets')
      .select('*')
      .eq('sport', searchParams.get('sport') ?? 'ncaaf')
      .eq('source', source)
      .order('season', { ascending: false })
      .limit(1);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const set = data?.[0];
    if (!set) return NextResponse.json({ error: `No rating set found for ${source}` }, { status: 404 });

    const rows: PowerRatingRow[] = set.ratings;
    const teamNames = rows.map((r) => r.team);
    const findRow = (oddsName: string) => {
      const matched = matchOddsNameToTeam(oddsName, teamNames);
      return { requested: oddsName, row: rows.find((r) => r.team === matched) ?? null };
    };
    const away = findRow(awayName);
    const home = findRow(homeName);

    let neutralSpread: number | null = null;
    let homeSpread: number | null = null;
    let hfaUsed: number | null = null;
    if (away.row && home.row) {
      hfaUsed = typeof home.row.hfa === 'number' ? home.row.hfa : DEFAULT_HFA;
      // Home line: negative = home favored (rounded to 0.1 like the rest of the app)
      neutralSpread = Math.round((away.row.thisYr - home.row.thisYr) * 10) / 10;
      homeSpread = Math.round((away.row.thisYr - home.row.thisYr - hfaUsed) * 10) / 10;
    }

    return NextResponse.json(
      {
        success: true,
        sourceLabel: set.source_label,
        season: set.season,
        asOf: set.as_of,
        away,
        home,
        hfaUsed,
        neutralSpread,
        homeSpread,
      },
      // Matchup lookups only change when a set is re-imported. The admin list
      // (no `teams` param) stays uncached so imports show up immediately.
      { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=3600' } }
    );
  }

  const { data, error } = await supabase
    .from('power_rating_sets')
    .select('*')
    .order('season', { ascending: false })
    .order('source_label', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, sets: data ?? [] });
}

export async function POST(request: Request) {
  let body: {
    sport?: string;
    source?: string;
    sourceLabel?: string;
    season?: number;
    asOf?: string | null;
    ratings?: PowerRatingRow[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const sourceLabel = (body.sourceLabel ?? '').trim();
  const season = Number(body.season);
  const ratings = body.ratings;

  if (!sourceLabel) return NextResponse.json({ error: 'sourceLabel is required' }, { status: 400 });
  if (!Number.isInteger(season) || season < 2000 || season > 2100) {
    return NextResponse.json({ error: 'season must be a 4-digit year' }, { status: 400 });
  }
  if (!Array.isArray(ratings) || ratings.length === 0) {
    return NextResponse.json({ error: 'ratings must be a non-empty array' }, { status: 400 });
  }

  const clean: PowerRatingRow[] = [];
  for (const r of ratings) {
    if (!r || typeof r.team !== 'string' || !r.team.trim() || !Number.isFinite(r.thisYr)) {
      return NextResponse.json({ error: `Bad ratings row: ${JSON.stringify(r)}` }, { status: 400 });
    }
    clean.push({
      rank: Number.isFinite(r.rank as number) ? r.rank : null,
      team: r.team.trim(),
      lastYr: Number.isFinite(r.lastYr as number) ? r.lastYr : null,
      thisYr: r.thisYr,
      conference: typeof r.conference === 'string' && r.conference.trim() ? r.conference.trim() : null,
      hfa: Number.isFinite(r.hfa as number) ? r.hfa : null,
    });
  }

  const row = {
    sport: (body.sport ?? 'ncaaf').trim(),
    source: (body.source ?? slugifySource(sourceLabel)) || 'unknown',
    source_label: sourceLabel,
    season,
    as_of: body.asOf || null,
    ratings: clean,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('power_rating_sets')
    .upsert(row, { onConflict: 'sport,source,season' })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, set: data });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { error } = await supabase.from('power_rating_sets').delete().eq('id', Number(id));
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
