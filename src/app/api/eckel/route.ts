// src/app/api/eckel/route.ts
//
// GET /api/eckel?year=2025             -> latest stored snapshot (all teams)
// GET /api/eckel?year=2025&teams=Away Team,Home Team
//                                      -> matchup extraction with name matching

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { EckelSnapshot, TeamSeasonMetrics } from '@/lib/eckel/types';
import { matchOddsToCfbd } from '@/lib/eckel/teamNames';

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const year = parseInt(params.get('year') || '') || new Date().getFullYear();

    // Latest snapshot for the requested season, else latest overall.
    let { data: rows, error } = await supabase
      .from('eckel_snapshots')
      .select('season, week, computed_at, data')
      .eq('season', year)
      .order('computed_at', { ascending: false })
      .limit(1);
    if ((!rows || !rows.length) && !error) {
      const fallback = await supabase
        .from('eckel_snapshots')
        .select('season, week, computed_at, data')
        .order('computed_at', { ascending: false })
        .limit(1);
      rows = fallback.data;
      error = fallback.error;
    }
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!rows || !rows.length) {
      return NextResponse.json(
        { error: 'No Eckel snapshot computed yet — POST /api/eckel/compute first' },
        { status: 404 }
      );
    }

    const snapshot = rows[0].data as EckelSnapshot;
    const teamsParam = params.get('teams');

    if (!teamsParam) {
      return NextResponse.json({ success: true, snapshot });
    }

    const cfbdTeams = snapshot.teams.map((t) => t.team);
    const byName = new Map(snapshot.teams.map((t) => [t.team, t]));
    const matchup: Array<{
      requested: string;
      matched: string | null;
      confidence: string;
      metrics: TeamSeasonMetrics | null;
      rank: number | null;
    }> = [];

    for (const requested of teamsParam.split(',').map((s) => s.trim()).filter(Boolean)) {
      const match = matchOddsToCfbd(requested, cfbdTeams);
      const metrics = match.confidence !== 'none' ? byName.get(match.cfbdName) ?? null : null;
      matchup.push({
        requested,
        matched: metrics ? match.cfbdName : null,
        confidence: match.confidence,
        metrics,
        rank: metrics ? snapshot.teams.indexOf(metrics) + 1 : null,
      });
    }

    return NextResponse.json({
      success: true,
      season: snapshot.season,
      week: snapshot.week,
      computedAt: snapshot.computedAt,
      hfaPoints: snapshot.meta.hfaPoints,
      matchup,
    });
  } catch (error) {
    console.error('[Eckel] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
