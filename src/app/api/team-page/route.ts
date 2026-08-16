// src/app/api/cfb-team/route.ts
// Standardized college-football team payload for the /team/ncaaf/[teamId]
// pages: identity + colors, coach, stadium, conference, and the full-season
// schedule. Aggregated live from ESPN (site + core APIs) with server-side
// caching — no database storage; every team page renders from this one shape.
//
// ?team= accepts an ESPN numeric id OR a team name (any common variant),
// so links can be built from Odds API names without an id lookup table.
// ?season= optional override; defaults to the current CFB season year.

import { NextResponse } from 'next/server';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football';
const CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/college-football';

const DAY = 60 * 60 * 24;
const HOUR = 60 * 60;

const normalize = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

async function getJson(url: string, revalidate: number): Promise<Record<string, unknown> | null> {
  try {
    const resp = await fetch(url.replace('http://', 'https://'), { next: { revalidate } });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// ESPN's deeply nested payloads make full typing impractical here; the OUTPUT
// shape (TeamPayload) is what the app depends on and is fully typed.

interface ScheduleGame {
  id: string;
  date: string;
  week: number | null;
  seasonType: 'regular' | 'postseason';
  home: boolean;
  neutral: boolean;
  venue: string | null;
  tv: string | null;
  opponent: { id: string; name: string; abbreviation: string | null; logo: string | null; rank: number | null };
  state: 'pre' | 'in' | 'post';
  completed: boolean;
  result: 'W' | 'L' | 'T' | null;
  teamScore: string | null;
  oppScore: string | null;
  detail: string | null;
}

export interface TeamPayload {
  team: {
    id: string;
    displayName: string;
    nickname: string | null;
    abbreviation: string | null;
    location: string | null;
    logo: string | null;
    color: string | null;
    alternateColor: string | null;
    record: string | null;
    standingSummary: string | null;
    conference: string | null;
    conferenceShort: string | null;
    coach: string | null;
    coachSeasons: number | null;
    venue: {
      name: string | null;
      city: string | null;
      state: string | null;
      capacity: number | null;
      grass: boolean | null;
      indoor: boolean | null;
      image: string | null;
    };
  };
  season: number;
  schedule: ScheduleGame[];
}

// CFB season year: Jan bowl games belong to the prior season's year.
function currentSeason(): number {
  const now = new Date();
  return now.getUTCMonth() >= 1 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

async function resolveTeamId(team: string): Promise<string | null> {
  if (/^\d+$/.test(team)) return team;
  const data: any = await getJson(`${SITE}/teams?limit=1000`, DAY);
  const entries: any[] = data?.sports?.[0]?.leagues?.[0]?.teams ?? [];
  const want = normalize(team);
  for (const entry of entries) {
    const t = entry?.team;
    if (!t) continue;
    const variants = [t.displayName, t.shortDisplayName, t.nickname, t.abbreviation, t.location,
      t.location && t.nickname ? `${t.location} ${t.nickname}` : null];
    if (variants.some((v) => v && normalize(v) === want)) return String(t.id);
  }
  return null;
}

function parseSchedule(data: any, teamId: string, seasonType: 'regular' | 'postseason'): ScheduleGame[] {
  const out: ScheduleGame[] = [];
  for (const e of data?.events ?? []) {
    const comp = e?.competitions?.[0];
    if (!comp) continue;
    const competitors: any[] = comp.competitors ?? [];
    const us = competitors.find((c) => String(c?.team?.id) === teamId);
    const them = competitors.find((c) => String(c?.team?.id) !== teamId);
    if (!us || !them) continue;
    const status = comp.status?.type ?? {};
    const oppRank = them.curatedRank?.current;
    const usScore = us.score?.displayValue ?? null;
    const themScore = them.score?.displayValue ?? null;
    out.push({
      id: String(e.id ?? comp.id ?? ''),
      date: e.date ?? comp.date ?? '',
      week: e.week?.number ?? null,
      seasonType,
      home: us.homeAway === 'home',
      neutral: Boolean(comp.neutralSite),
      venue: comp.venue?.fullName ?? null,
      tv: comp.broadcasts?.[0]?.media?.shortName ?? null,
      opponent: {
        id: String(them.team?.id ?? ''),
        name: them.team?.displayName ?? them.team?.shortDisplayName ?? '?',
        abbreviation: them.team?.abbreviation ?? null,
        logo: them.team?.logos?.[0]?.href ?? (them.team?.id ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${them.team.id}.png` : null),
        rank: typeof oppRank === 'number' && oppRank <= 25 ? oppRank : null,
      },
      state: (status.state as 'pre' | 'in' | 'post') ?? 'pre',
      completed: Boolean(status.completed),
      result: status.completed && usScore !== null && themScore !== null
        ? (us.winner ? 'W' : them.winner ? 'L' : 'T')
        : null,
      teamScore: usScore,
      oppScore: themScore,
      detail: status.shortDetail ?? null,
    });
  }
  return out;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const teamParam = searchParams.get('team');
  if (!teamParam) {
    return NextResponse.json({ error: 'Missing team parameter' }, { status: 400 });
  }
  const season = Number(searchParams.get('season')) || currentSeason();

  const teamId = await resolveTeamId(teamParam);
  if (!teamId) {
    return NextResponse.json({ error: `Unknown team: ${teamParam}` }, { status: 404 });
  }

  const [siteTeam, coreTeam, schedReg, schedPost] = await Promise.all([
    getJson(`${SITE}/teams/${teamId}`, HOUR),
    getJson(`${CORE}/seasons/${season}/teams/${teamId}`, DAY),
    getJson(`${SITE}/teams/${teamId}/schedule?season=${season}&seasontype=2`, HOUR),
    getJson(`${SITE}/teams/${teamId}/schedule?season=${season}&seasontype=3`, HOUR),
  ]);

  const t: any = (siteTeam as any)?.team;
  if (!t) {
    return NextResponse.json({ error: 'Team lookup failed' }, { status: 502 });
  }

  // Conference, coach, and full venue live behind core-API $refs.
  const core: any = coreTeam ?? {};
  const [group, coachList, venueFull] = await Promise.all([
    core.groups?.$ref ? getJson(core.groups.$ref, DAY) : null,
    core.coaches?.$ref ? getJson(core.coaches.$ref, DAY) : null,
    core.venue?.$ref ? getJson(core.venue.$ref, DAY) : null,
  ]);
  let coach: string | null = null;
  let coachSeasons: number | null = null;
  const coachRef = (coachList as any)?.items?.[0]?.$ref;
  if (coachRef) {
    const c: any = await getJson(coachRef, DAY);
    if (c) {
      coach = [c.firstName, c.lastName].filter(Boolean).join(' ') || null;
      coachSeasons = typeof c.experience === 'number' ? c.experience : null;
    }
  }

  const venue: any = venueFull ?? core.venue ?? {};
  const recordItems: any[] = t.record?.items ?? [];
  const record = recordItems.find((r) => r.type === 'total')?.summary ?? recordItems[0]?.summary ?? null;

  const schedule = [
    ...parseSchedule(schedReg, teamId, 'regular'),
    ...parseSchedule(schedPost, teamId, 'postseason'),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const payload: TeamPayload = {
    team: {
      id: teamId,
      displayName: t.displayName ?? '?',
      nickname: t.nickname ?? null,
      abbreviation: t.abbreviation ?? null,
      location: t.location ?? null,
      logo: t.logos?.[0]?.href ?? `https://a.espncdn.com/i/teamlogos/ncaa/500/${teamId}.png`,
      color: t.color ?? null,
      alternateColor: t.alternateColor ?? null,
      record,
      standingSummary: t.standingSummary ?? null,
      conference: (group as any)?.name ?? null,
      conferenceShort: (group as any)?.shortName ?? null,
      coach,
      coachSeasons,
      venue: {
        name: venue.fullName ?? null,
        city: venue.address?.city ?? null,
        state: venue.address?.state ?? null,
        capacity: typeof venue.capacity === 'number' && venue.capacity > 0 ? venue.capacity : null,
        grass: typeof venue.grass === 'boolean' ? venue.grass : null,
        indoor: typeof venue.indoor === 'boolean' ? venue.indoor : null,
        image: venue.images?.[0]?.href ?? null,
      },
    },
    season,
    schedule,
  };

  return NextResponse.json(payload);
}
