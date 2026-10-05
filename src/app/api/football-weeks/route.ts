// src/app/api/football-weeks/route.ts
//
// Week date ranges for a football season, from ESPN's scoreboard calendar:
// GET /api/football-weeks?league=NFL|NCAAF&season=2026
//   → { weeks: [{ label: "Wk 1", start: "2026-09-06T07:00Z", end: "2026-09-16T06:59Z" }, ...] }
// Used by My Bets to bucket wagers week by week. Regular-season weeks are
// "Wk N", NFL preseason "Pre N", postseason keeps ESPN's names (Wild Card,
// Super Bowl, Bowls). Cached a day — the calendar doesn't move.

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const PATHS: Record<string, string> = {
  NFL: 'football/nfl',
  NCAAF: 'football/college-football',
};

interface CalendarEntry { label?: string; value?: string; startDate?: string; endDate?: string }
interface CalendarType { label?: string; value?: string; entries?: CalendarEntry[] }

export interface WeekRange { label: string; start: string; end: string }

// ESPN's postseason names, shortened so a My Bets row fits a phone
const POST_LABELS: Record<string, string> = {
  'Divisional Round': 'Divisional',
  'Conference Championship': 'Conf Champ',
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const league = (searchParams.get('league') ?? '').toUpperCase();
  const season = parseInt(searchParams.get('season') ?? '', 10);
  const path = PATHS[league];
  if (!path || !Number.isFinite(season) || season < 2000 || season > 2100) {
    return NextResponse.json({ error: 'league must be NFL or NCAAF, season a year' }, { status: 400 });
  }

  try {
    // Any scoreboard call for the season carries the full calendar; week 1 with
    // limit=1 keeps the payload tiny.
    const url = `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${season}&seasontype=2&week=1&limit=1`;
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) throw new Error(`ESPN ${res.status}`);
    const json = await res.json();
    const calendar: CalendarType[] = json?.leagues?.[0]?.calendar ?? [];

    const weeks: WeekRange[] = [];
    for (const type of calendar) {
      const typeValue = type.value;
      if (typeValue !== '1' && typeValue !== '2' && typeValue !== '3') continue; // skip Off Season
      if (typeValue === '1' && league !== 'NFL') continue;                       // CFB has no preseason
      for (const e of type.entries ?? []) {
        if (!e.startDate || !e.endDate) continue;
        if (league === 'NCAAF' && typeValue === '3' && e.value === '999') continue; // "CFP" overlaps "Bowls"
        const n = e.value ?? '';
        const label =
          typeValue === '2' ? `Wk ${n}` :
          typeValue === '1' ? `Pre ${n}` :
          (POST_LABELS[e.label ?? ''] ?? e.label ?? `Post ${n}`);
        weeks.push({ label, start: e.startDate, end: e.endDate });
      }
    }

    return NextResponse.json(
      { league, season, weeks },
      { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } },
    );
  } catch (err) {
    console.error('[football-weeks]', err);
    return NextResponse.json({ league, season, weeks: [] }, { status: 200 });
  }
}
