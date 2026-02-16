// src/app/api/lacrosse/import-ratings/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { initializeFromMassey } from '@/lib/lacrosse/supabase';

/**
 * Import Massey Lacrosse Ratings from CSV
 *
 * POST body: { csvText: string, season?: number }
 *
 * Parses header row to find columns by name:
 *   "Team", "Conf", "Pwr Rating"
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { csvText, season = 2026 } = body;

    if (!csvText || typeof csvText !== 'string') {
      return NextResponse.json({
        success: false,
        error: 'csvText is required',
      }, { status: 400 });
    }

    const lines = csvText
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    if (lines.length < 2) {
      return NextResponse.json({
        success: false,
        error: 'CSV must have a header row and at least one data row.',
      }, { status: 400 });
    }

    // Detect delimiter — tab or comma
    const headerRaw = lines[0].replace(/[^\x20-\x7E]/g, '');
    const delimiter = headerRaw.includes('\t') ? '\t' : ',';
    const cleanCol = (s: string) => s.trim().toLowerCase();
    const headerCols = headerRaw.split(delimiter).map(cleanCol);

    const teamIdx = headerCols.findIndex(h => h === 'team');
    const confIdx = headerCols.findIndex(h => h === 'conf');
    const pwrRatingIdx = headerCols.findIndex(h => h === 'pwr rating');

    if (teamIdx === -1 || pwrRatingIdx === -1) {
      return NextResponse.json({
        success: false,
        error: `Required columns not found (delimiter="${delimiter === '\t' ? 'tab' : 'comma'}"). Found headers: [${headerCols.join(' | ')}]. Need "Team" and "Pwr Rating".`,
      }, { status: 400 });
    }

    const teams: Array<{ Team: string; Rating: number; Conf?: string }> = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(delimiter);

      const teamName = cols[teamIdx]?.trim();
      const conf = confIdx !== -1 ? cols[confIdx]?.trim() : undefined;
      const ratingVal = parseFloat(cols[pwrRatingIdx]?.trim());

      if (!teamName || isNaN(ratingVal)) continue;

      teams.push({
        Team: teamName,
        Rating: ratingVal,
        Conf: conf || undefined,
      });
    }

    if (teams.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No valid teams found in CSV.',
      }, { status: 400 });
    }

    console.log(`[Import Massey] Parsed ${teams.length} teams, importing for season ${season}`);

    await initializeFromMassey(teams, season);

    return NextResponse.json({
      success: true,
      teamsImported: teams.length,
      sample: teams.slice(0, 5).map(t => ({ team: t.Team, conf: t.Conf, rating: t.Rating })),
    });
  } catch (error) {
    console.error('[Import Massey] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to import ratings',
    }, { status: 500 });
  }
}
