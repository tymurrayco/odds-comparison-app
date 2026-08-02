// src/app/api/neutral-sites/route.ts
//
// GET /api/neutral-sites[?year=2026]
// Neutral-site NCAAF games (regular season + postseason) from CFBD.

import { NextRequest, NextResponse } from 'next/server';
import { NeutralGame } from '@/lib/neutralSites';

const CFBD_BASE = 'https://api.collegefootballdata.com';

interface RawGame {
  neutralSite?: boolean;
  neutral_site?: boolean;
  homeTeam?: string;
  home_team?: string;
  awayTeam?: string;
  away_team?: string;
  startDate?: string;
  start_date?: string;
  venue?: string;
}

async function fetchSeasonType(year: number, seasonType: string, key: string): Promise<NeutralGame[]> {
  const qs = new URLSearchParams({ year: String(year), seasonType });
  const resp = await fetch(`${CFBD_BASE}/games?${qs}`, {
    headers: { Authorization: `Bearer ${key}` },
    // CFBD updates schedules rarely; let Next cache the upstream call for 6h.
    next: { revalidate: 21_600 },
  });
  if (!resp.ok) {
    console.error(`[neutral-sites] CFBD ${seasonType} ${year}: HTTP ${resp.status}`);
    return [];
  }
  const raw = (await resp.json()) as RawGame[];
  return raw
    .filter((g) => g.neutralSite ?? g.neutral_site)
    .map((g) => ({
      date: (g.startDate ?? g.start_date ?? '').slice(0, 10),
      homeTeam: g.homeTeam ?? g.home_team ?? '',
      awayTeam: g.awayTeam ?? g.away_team ?? '',
      venue: g.venue ?? null,
    }))
    .filter((g) => g.date && g.homeTeam && g.awayTeam);
}

export async function GET(request: NextRequest) {
  const key = process.env.CFBD_API_KEY;
  if (!key) {
    // Not fatal — callers treat an empty list as "no neutral games known".
    return NextResponse.json({ success: false, error: 'CFBD_API_KEY is not set', games: [] });
  }

  const year = parseInt(request.nextUrl.searchParams.get('year') || '') || new Date().getFullYear();

  try {
    const [regular, postseason] = await Promise.all([
      fetchSeasonType(year, 'regular', key),
      fetchSeasonType(year, 'postseason', key),
    ]);
    const games = [...regular, ...postseason];

    return NextResponse.json(
      { success: true, season: year, count: games.length, games },
      { headers: { 'Cache-Control': 's-maxage=21600, stale-while-revalidate=86400' } }
    );
  } catch (error) {
    console.error('[neutral-sites] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed', games: [] },
      { status: 500 }
    );
  }
}
