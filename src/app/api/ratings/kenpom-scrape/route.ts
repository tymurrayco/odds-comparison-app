// src/app/api/ratings/kenpom-scrape/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { scrapeKenpomDateRange, backfillBoxScores } from '@/lib/kenpom/scraper';
import { saveKenpomGames, loadKenpomGames } from '@/lib/kenpom/supabase';

export const maxDuration = 300; // 5 min for Vercel (incremental)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') || 'incremental';
  const season = parseInt(searchParams.get('season') || '2026', 10);

  try {
    // Backfill box scores for games already in DB
    if (mode === 'backfill-box') {
      console.log(`KenPom backfill-box: loading games missing box scores for season ${season}`);
      const games = await loadKenpomGames({ season });
      const result = await backfillBoxScores(games, saveKenpomGames);

      return NextResponse.json({
        success: true,
        mode,
        season,
        ...result,
      });
    }

    let startDate: string;
    let endDate: string;

    if (mode === 'bulk') {
      const s = searchParams.get('startDate');
      const e = searchParams.get('endDate');
      if (!s || !e) {
        return NextResponse.json({
          success: false,
          error: 'Bulk mode requires startDate and endDate (YYYY-MM-DD)',
        }, { status: 400 });
      }
      startDate = s;
      endDate = e;
    } else {
      // Incremental: single date (default today Eastern)
      const dateParam = searchParams.get('date');
      if (dateParam) {
        startDate = dateParam;
        endDate = dateParam;
      } else {
        const now = new Date();
        const eastern = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const y = eastern.getFullYear();
        const m = String(eastern.getMonth() + 1).padStart(2, '0');
        const d = String(eastern.getDate()).padStart(2, '0');
        const today = `${y}-${m}-${d}`;
        startDate = today;
        endDate = today;
      }
    }

    console.log(`KenPom scrape: mode=${mode} dates=${startDate} to ${endDate} season=${season}`);

    const result = await scrapeKenpomDateRange(startDate, endDate, season, saveKenpomGames);

    return NextResponse.json({
      success: true,
      mode,
      startDate,
      endDate,
      season,
      ...result,
    });

  } catch (error) {
    console.error('KenPom scrape error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Scrape failed',
    }, { status: 500 });
  }
}
