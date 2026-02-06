// src/app/api/ratings/sbr-mapping/route.ts
// API route for managing SBR team name → KenPom/BT name mappings

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, loadTeamOverrides, loadRatings } from '@/lib/ratings/supabase';

/**
 * GET - Load all SBR mappings and available team names for dropdown
 */
export async function GET() {
  try {
    const [overrides, ratings] = await Promise.all([
      loadTeamOverrides(),
      loadRatings(2026),
    ]);

    // Build SBR name -> kenpom name lookup from overrides that have sbr_name set
    const sbrMappings: Record<string, string> = {};
    for (const override of overrides) {
      if (override.sbrName) {
        sbrMappings[override.sbrName.toLowerCase()] = override.kenpomName;
      }
    }

    // KenPom team names for the dropdown
    const kenpomTeams = Array.from(ratings.keys()).sort();

    return NextResponse.json({
      success: true,
      sbrMappings,
      kenpomTeams,
    });
  } catch (error) {
    console.error('[SBR Mapping API] GET Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load SBR mappings' },
      { status: 500 }
    );
  }
}

/**
 * POST - Save an SBR name mapping
 * Body: { sbrName: string, kenpomName: string }
 * 
 * This finds the override row with matching kenpom_name and sets sbr_name on it.
 * If no override row exists for that kenpom_name, it creates one.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sbrName, kenpomName } = body;

    if (!sbrName || !kenpomName) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: sbrName and kenpomName' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // First, clear any existing override that has this sbr_name 
    // (in case it was previously mapped to a different team)
    await supabase
      .from('ncaab_team_overrides')
      .update({ sbr_name: null })
      .eq('sbr_name', sbrName);

    // Check if an override row exists for this kenpom_name
    const { data: existing } = await supabase
      .from('ncaab_team_overrides')
      .select('id')
      .eq('kenpom_name', kenpomName)
      .limit(1);

    if (existing && existing.length > 0) {
      // Update existing row
      const { error } = await supabase
        .from('ncaab_team_overrides')
        .update({ sbr_name: sbrName })
        .eq('id', existing[0].id);

      if (error) {
        console.error('[SBR Mapping API] Update error:', error);
        return NextResponse.json(
          { success: false, error: 'Failed to update mapping' },
          { status: 500 }
        );
      }
    } else {
      // Create new override row with this SBR mapping
      const { error } = await supabase
        .from('ncaab_team_overrides')
        .insert({
          source_name: kenpomName,
          kenpom_name: kenpomName,
          sbr_name: sbrName,
          source: 'sbr-mapping',
        });

      if (error) {
        console.error('[SBR Mapping API] Insert error:', error);
        return NextResponse.json(
          { success: false, error: 'Failed to create mapping' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true, sbrName, kenpomName });
  } catch (error) {
    console.error('[SBR Mapping API] POST Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Remove an SBR name mapping
 * Body: { sbrName: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { sbrName } = body;

    if (!sbrName) {
      return NextResponse.json(
        { success: false, error: 'Missing sbrName' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from('ncaab_team_overrides')
      .update({ sbr_name: null })
      .eq('sbr_name', sbrName);

    if (error) {
      console.error('[SBR Mapping API] Delete error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to remove mapping' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[SBR Mapping API] DELETE Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
