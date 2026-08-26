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
  /** Depth-chart rank at the player's best position: 1 = starter, 2 = second
   *  string, etc. null = not on the current depth chart. */
  depthRank: number | null;
}

interface ESPNInjury {
  status?: string;
  date?: string;
  shortComment?: string;
  longComment?: string;
  athlete?: {
    displayName?: string;
    position?: { abbreviation?: string };
    headshot?: { href?: string };
  };
}
interface ESPNTeamInjuries {
  id?: string;
  displayName?: string;
  injuries?: ESPNInjury[];
}

// Depth-chart rank per athlete for one team. The feed has no athlete id
// field, but the headshot URL and the depth chart's $ref both carry it, so
// the join is exact (verified 25/25 on the Texans). Charts move slowly —
// cache 12h, separate from the 30-min injuries cache.
async function getDepthRanks(teamId: string): Promise<Map<string, number>> {
  const ranks = new Map<string, number>();
  try {
    const resp = await fetch(
      `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${new Date().getFullYear()}/teams/${teamId}/depthcharts`,
      { next: { revalidate: 43200 } }
    );
    if (!resp.ok) return ranks;
    const data = await resp.json();
    interface DCAthlete { rank?: number; athlete?: { $ref?: string } }
    interface DCPosition { athletes?: DCAthlete[] }
    interface DCGroup { positions?: Record<string, DCPosition> }
    for (const grp of (data.items ?? []) as DCGroup[]) {
      for (const pos of Object.values(grp.positions ?? {})) {
        for (const a of pos.athletes ?? []) {
          const m = a.athlete?.$ref?.match(/\/athletes\/(\d+)/);
          if (!m) continue;
          const prev = ranks.get(m[1]);
          const r = a.rank ?? 99;
          if (prev === undefined || r < prev) ranks.set(m[1], r);
        }
      }
    }
  } catch {
    // fail open: entries just get depthRank null
  }
  return ranks;
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

    const feed = (data.injuries ?? []) as ESPNTeamInjuries[];

    // Depth charts for all teams in parallel (each fetch is 12h-cached, so
    // this is 32 upstream calls twice a day, not per request).
    const rankMaps = await Promise.all(
      feed.map((t) => (t.id ? getDepthRanks(t.id) : Promise.resolve(new Map<string, number>())))
    );

    const teams: Record<string, InjuryEntry[]> = {};
    feed.forEach((t, ti) => {
      const name = t.displayName;
      if (!name) return;
      const ranks = rankMaps[ti];
      const list: InjuryEntry[] = [];
      for (const i of t.injuries ?? []) {
        const status = i.status ?? '';
        if (SKIP_STATUSES.has(status.toLowerCase())) continue;
        const idMatch = i.athlete?.headshot?.href?.match(/\/(\d+)\.png/);
        const depthRank = idMatch ? ranks.get(idMatch[1]) ?? null : null;
        list.push({
          name: i.athlete?.displayName ?? 'Unknown',
          position: i.athlete?.position?.abbreviation ?? '',
          status,
          comment: i.shortComment || null,
          date: i.date || null,
          depthRank,
        });
      }
      if (list.length) teams[name] = list;
    });

    return NextResponse.json(
      { teams, fetchedAt: new Date().toISOString() },
      { headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' } }
    );
  } catch {
    return NextResponse.json({ error: 'fetch failed' }, { status: 502 });
  }
}
