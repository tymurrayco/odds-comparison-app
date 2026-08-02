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
  venueId?: number;
  venue_id?: number;
}

interface RawVenue {
  id?: number;
  name?: string;
  city?: string;
  state?: string;
  countryCode?: string;
  country_code?: string;
  dome?: boolean;
  capacity?: number;
  elevation?: number | string; // meters — CFBD sends this one as a STRING
}

const M_TO_FT = 3.28084;

/** CFBD types elevation as a string ("2200.153564"); capacity comes back numeric. */
const toNum = (v: unknown): number | null => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

type VenueInfo = Omit<NeutralGame, 'date' | 'homeTeam' | 'awayTeam' | 'venue'>;
const EMPTY_VENUE: VenueInfo = {
  city: null, state: null, country: null, dome: null, capacity: null, elevationFt: null,
};

async function fetchVenues(key: string): Promise<Map<number, VenueInfo>> {
  const map = new Map<number, VenueInfo>();
  const resp = await fetch(`${CFBD_BASE}/venues`, {
    headers: { Authorization: `Bearer ${key}` },
    next: { revalidate: 604_800 }, // venues essentially never change
  });
  if (!resp.ok) {
    console.error(`[neutral-sites] CFBD /venues: HTTP ${resp.status}`);
    return map;
  }
  for (const v of (await resp.json()) as RawVenue[]) {
    if (typeof v.id !== 'number') continue;
    const meters = toNum(v.elevation);
    map.set(v.id, {
      city: v.city || null,
      state: v.state || null,
      country: v.countryCode ?? v.country_code ?? null,
      dome: typeof v.dome === 'boolean' ? v.dome : null,
      capacity: toNum(v.capacity),
      elevationFt: meters === null ? null : Math.round(meters * M_TO_FT),
    });
  }
  return map;
}

async function fetchSeasonType(
  year: number,
  seasonType: string,
  key: string,
  venues: Map<number, VenueInfo>
): Promise<NeutralGame[]> {
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
    .map((g) => {
      const venueId = g.venueId ?? g.venue_id;
      return {
        date: (g.startDate ?? g.start_date ?? '').slice(0, 10),
        homeTeam: g.homeTeam ?? g.home_team ?? '',
        awayTeam: g.awayTeam ?? g.away_team ?? '',
        venue: g.venue ?? null,
        ...(typeof venueId === 'number' ? venues.get(venueId) ?? EMPTY_VENUE : EMPTY_VENUE),
      };
    })
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
    const venues = await fetchVenues(key);
    const [regular, postseason] = await Promise.all([
      fetchSeasonType(year, 'regular', key, venues),
      fetchSeasonType(year, 'postseason', key, venues),
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
