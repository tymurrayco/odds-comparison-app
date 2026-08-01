// src/app/api/power-ratings/route.ts
// CRUD for power_rating_sets — one row per (sport, source, season), ratings as JSONB.

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { PowerRatingRow, slugifySource } from '@/lib/powerRatings';

export const dynamic = 'force-dynamic';

export async function GET() {
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
