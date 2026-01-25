// src/app/api/ratings/overrides/route.ts

import { NextRequest, NextResponse } from 'next/server';
import {
  loadRatings,
  loadTeamOverrides,
  addTeamOverride,
  updateTeamOverride,
  deleteTeamOverride,
  TeamOverride,
  loadOddsApiTeams,
} from '@/lib/ratings/supabase';

export async function GET() {
  try {
    // Load overrides
    const overrides = await loadTeamOverrides();
    
    // Load KenPom team names from ratings
    const ratings = await loadRatings(2026);
    const kenpomTeams = Array.from(ratings.keys()).sort();
    
    // Load Odds API team names
    const oddsApiTeams = await loadOddsApiTeams();
    
    return NextResponse.json({
      success: true,
      overrides,
      kenpomTeams,
      oddsApiTeams,
    });
  } catch (error) {
    console.error('[Overrides API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load overrides' },
      { status: 500 }
    );
  }
}

// POST - Add new override
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.sourceName || !body.kenpomName) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: sourceName and kenpomName' },
        { status: 400 }
      );
    }
    
    const overrideData: TeamOverride = {
      sourceName: body.sourceName,
      kenpomName: body.kenpomName,
      espnName: body.espnName || undefined,
      oddsApiName: body.oddsApiName || undefined,
      source: body.source || 'manual',
      notes: body.notes || undefined,
    };
    
    const result = await addTeamOverride(overrideData);
    if (!result) {
      return NextResponse.json(
        { success: false, error: 'Failed to add override' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ success: true, override: result });
  } catch (error) {
    console.error('[Overrides API] POST Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update existing override
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.id) {
      return NextResponse.json(
        { success: false, error: 'Missing id for update' },
        { status: 400 }
      );
    }
    
    if (!body.sourceName || !body.kenpomName) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: sourceName and kenpomName' },
        { status: 400 }
      );
    }
    
    const overrideData: Partial<TeamOverride> = {
      sourceName: body.sourceName,
      kenpomName: body.kenpomName,
      espnName: body.espnName || undefined,
      oddsApiName: body.oddsApiName || undefined,
      source: body.source || 'manual',
      notes: body.notes || undefined,
    };
    
    const success = await updateTeamOverride(body.id, overrideData);
    if (!success) {
      return NextResponse.json(
        { success: false, error: 'Failed to update override' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ success: true, updated: true });
  } catch (error) {
    console.error('[Overrides API] PUT Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete override
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Missing id for delete' },
        { status: 400 }
      );
    }
    
    const success = await deleteTeamOverride(parseInt(id, 10));
    if (!success) {
      return NextResponse.json(
        { success: false, error: 'Failed to delete override' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ success: true, deleted: true });
  } catch (error) {
    console.error('[Overrides API] DELETE Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
