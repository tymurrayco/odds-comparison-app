// src/app/api/eckel/route.ts
//
// GET /api/eckel?year=2025             -> latest stored snapshot (all teams)
// GET /api/eckel?year=2025&teams=Away Team,Home Team
//                                      -> matchup extraction with name matching

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { EckelSnapshot, TeamSeasonMetrics } from '@/lib/eckel/types';
import { matchOddsToCfbd } from '@/lib/eckel/teamNames';
import { PowerRatingRow, matchOddsNameToTeam } from '@/lib/powerRatings';

// Brad Powers' per-team homefield advantage for the HOME side of a matchup;
// null if no rating set exists or the team isn't in it.
async function powersHomeHfa(homeOddsName: string): Promise<number | null> {
  const { data } = await supabase
    .from('power_rating_sets')
    .select('ratings')
    .eq('sport', 'ncaaf')
    .eq('source', 'brad_powers')
    .order('season', { ascending: false })
    .limit(1);
  const rows: PowerRatingRow[] | undefined = data?.[0]?.ratings;
  if (!rows?.length) return null;
  const matched = matchOddsNameToTeam(homeOddsName, rows.map((r) => r.team));
  const hfa = rows.find((r) => r.team === matched)?.hfa;
  return typeof hfa === 'number' ? hfa : null;
}

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

    // Prefer Brad Powers' per-team HFA for the home side (second team);
    // fall back to the snapshot's fitted league-wide HFA.
    const homeRequested = matchup[1]?.requested;
    const powersHfa = homeRequested ? await powersHomeHfa(homeRequested) : null;

    return NextResponse.json({
      success: true,
      season: snapshot.season,
      week: snapshot.week,
      computedAt: snapshot.computedAt,
      hfaPoints: powersHfa ?? snapshot.meta.hfaPoints,
      hfaSource: powersHfa !== null ? 'powers' : 'eckel-fit',
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
