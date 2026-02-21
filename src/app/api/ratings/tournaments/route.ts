// src/app/api/ratings/tournaments/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/ratings/supabase';

// GET - Load saved brackets for a season
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const season = parseInt(searchParams.get('season') || '2026');
    const conference = searchParams.get('conference');

    const supabase = getSupabaseClient();

    let query = supabase
      .from('ncaab_tournament_brackets')
      .select('*')
      .eq('season', season)
      .order('updated_at', { ascending: false });

    if (conference) {
      query = query.eq('conference', conference);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Tournaments API] GET error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to load brackets' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      brackets: (data || []).map(row => ({
        id: row.id,
        name: row.name,
        conference: row.conference,
        configJson: row.config_json,
        season: row.season,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    console.error('[Tournaments API] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Upsert a bracket (by conference + season)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.conference || !body.configJson) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: conference, configJson' },
        { status: 400 }
      );
    }

    const season = body.season || 2026;
    const supabase = getSupabaseClient();

    // Check if bracket already exists for this conference + season
    const { data: existing } = await supabase
      .from('ncaab_tournament_brackets')
      .select('id')
      .eq('conference', body.conference)
      .eq('season', season)
      .limit(1);

    const row = {
      name: body.name || `${body.conference} Tournament`,
      conference: body.conference,
      config_json: body.configJson,
      season: season,
      updated_at: new Date().toISOString(),
    };

    let result;
    if (existing && existing.length > 0) {
      // Update existing
      result = await supabase
        .from('ncaab_tournament_brackets')
        .update(row)
        .eq('id', existing[0].id)
        .select()
        .single();
    } else {
      // Insert new
      result = await supabase
        .from('ncaab_tournament_brackets')
        .insert({ ...row, created_at: new Date().toISOString() })
        .select()
        .single();
    }

    if (result.error) {
      console.error('[Tournaments API] POST error:', result.error);
      return NextResponse.json(
        { success: false, error: 'Failed to save bracket' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      bracket: {
        id: result.data.id,
        name: result.data.name,
        conference: result.data.conference,
        configJson: result.data.config_json,
        season: result.data.season,
        createdAt: result.data.created_at,
        updatedAt: result.data.updated_at,
      },
    });
  } catch (error) {
    console.error('[Tournaments API] POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Remove a bracket
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Missing bracket id' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from('ncaab_tournament_brackets')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[Tournaments API] DELETE error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to delete bracket' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Tournaments API] DELETE error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
