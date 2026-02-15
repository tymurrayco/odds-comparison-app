// src/app/api/ratings/kenpom-scrape/export/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { loadKenpomGames } from '@/lib/kenpom/supabase';

function escapeCSV(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const season = parseInt(searchParams.get('season') || '2026', 10);
  const startDate = searchParams.get('startDate') || undefined;
  const endDate = searchParams.get('endDate') || undefined;

  try {
    const games = await loadKenpomGames({ season, startDate, endDate });

    const header = [
      'date', 'home', 'away',
      'pred_home', 'pred_away', 'pred_spread', 'pred_total',
      'home_q1', 'home_q2', 'home_q3', 'home_q4', 'home_total',
      'away_q1', 'away_q2', 'away_q3', 'away_q4', 'away_total',
      'actual_spread', 'actual_total',
    ];

    const rows = games.map(g => {
      const predSpread = (g.predicted_home_score !== null && g.predicted_away_score !== null)
        ? (g.predicted_away_score - g.predicted_home_score).toFixed(1)
        : '';
      const predTotal = (g.predicted_home_score !== null && g.predicted_away_score !== null)
        ? (g.predicted_home_score + g.predicted_away_score).toFixed(1)
        : '';
      const actualSpread = (g.home_total !== null && g.away_total !== null)
        ? (g.away_total - g.home_total).toFixed(1)
        : '';
      const actualTotal = (g.home_total !== null && g.away_total !== null)
        ? (g.home_total + g.away_total).toString()
        : '';

      return [
        g.game_date,
        g.home_team,
        g.away_team,
        g.predicted_home_score ?? '',
        g.predicted_away_score ?? '',
        predSpread,
        predTotal,
        g.home_q1 ?? '',
        g.home_q2 ?? '',
        g.home_q3 ?? '',
        g.home_q4 ?? '',
        g.home_total ?? '',
        g.away_q1 ?? '',
        g.away_q2 ?? '',
        g.away_q3 ?? '',
        g.away_q4 ?? '',
        g.away_total ?? '',
        actualSpread,
        actualTotal,
      ].map(escapeCSV);
    });

    const csv = [header, ...rows].map(r => r.join(',')).join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="kenpom_games_${season}_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });

  } catch (error) {
    console.error('KenPom export error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Export failed',
    }, { status: 500 });
  }
}
