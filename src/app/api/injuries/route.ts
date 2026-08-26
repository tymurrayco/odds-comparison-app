// src/app/api/injuries/route.ts
// NFL injury report, from ESPN's free league-wide injuries endpoint. One
// upstream call covers all 32 teams, so every game card shares this cache.
// CFB deliberately unsupported: ESPN has no CFB injury data (verified
// 2026-08-25 — per-team endpoint returns {}, athletes show Active even when
// out for the season).
import { NextResponse } from 'next/server';

export const revalidate = 1800; // 30 min

interface InjuryEntry {
  name: string;
  position: string;
  status: string;
  comment: string | null;
  date: string | null;
}

interface ESPNInjury {
  status?: string;
  date?: string;
  shortComment?: string;
  longComment?: string;
  athlete?: { displayName?: string; position?: { abbreviation?: string } };
}
interface ESPNTeamInjuries {
  displayName?: string;
  injuries?: ESPNInjury[];
}

// "Active" entries are news blurbs (contract signings, returns to practice),
// not injuries — drop them so the card shows only players with a designation.
const SKIP_STATUSES = new Set(['active', 'healthy']);

export async function GET(request: Request) {
  const league = new URL(request.url).searchParams.get('league') ?? 'nfl';
  if (league !== 'nfl') {
    return NextResponse.json({ error: `no injury source for ${league}` }, { status: 400 });
  }

  try {
    const resp = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries?limit=100',
      { next: { revalidate: 1800 } }
    );
    if (!resp.ok) {
      return NextResponse.json({ error: 'upstream error' }, { status: 502 });
    }
    const data = await resp.json();

    const teams: Record<string, InjuryEntry[]> = {};
    for (const t of (data.injuries ?? []) as ESPNTeamInjuries[]) {
      const name = t.displayName;
      if (!name) continue;
      const list: InjuryEntry[] = [];
      for (const i of t.injuries ?? []) {
        const status = i.status ?? '';
        if (SKIP_STATUSES.has(status.toLowerCase())) continue;
        list.push({
          name: i.athlete?.displayName ?? 'Unknown',
          position: i.athlete?.position?.abbreviation ?? '',
          status,
          comment: i.shortComment || null,
          date: i.date || null,
        });
      }
      if (list.length) teams[name] = list;
    }

    return NextResponse.json(
      { teams, fetchedAt: new Date().toISOString() },
      { headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' } }
    );
  } catch {
    return NextResponse.json({ error: 'fetch failed' }, { status: 502 });
  }
}
