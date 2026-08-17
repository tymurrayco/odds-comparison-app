// src/app/api/team-page/route.ts
// Standardized football team payload for the /team/[league]/[teamId] pages:
// identity + colors, coach, stadium, conference/division, and the full-season
// schedule. Aggregated live from ESPN (site + core APIs) with server-side
// caching — no database storage; every team page renders from this one shape.
//
// ?league= ncaaf | nfl. ?team= accepts an ESPN numeric id OR a team name
// (any common variant), so links can be built from Odds API names without an
// id lookup table. ?season= optional override; defaults to the current season.

import { NextResponse } from 'next/server';

const DAY = 60 * 60 * 24;
const HOUR = 60 * 60;

type SeasonType = 'preseason' | 'regular' | 'postseason';

interface LeagueConfig {
  site: string;   // site.api base for this league
  core: string;   // core.api base for this league
  seasonTypes: [SeasonType, number][]; // which schedule segments to fetch
}

const LEAGUES: Record<string, LeagueConfig> = {
  ncaaf: {
    site: 'https://site.api.espn.com/apis/site/v2/sports/football/college-football',
    core: 'https://sports.core.api.espn.com/v2/sports/football/leagues/college-football',
    seasonTypes: [['regular', 2], ['postseason', 3]],
  },
  nfl: {
    site: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl',
    core: 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl',
    // NFL preseason games are bettable and on the odds board — include them.
    seasonTypes: [['preseason', 1], ['regular', 2], ['postseason', 3]],
  },
};

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
  seasonType: SeasonType;
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
  // Closing line vs result, filled for completed games scored by computeAts
  closing: {
    spread: number | null;           // team-relative closing spread
    atsRes: 'W' | 'L' | 'P' | null;
    total: number | null;
    ouRes: 'O' | 'U' | 'P' | null;
  } | null;
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
    conference: string | null;       // NCAAF conference / NFL division
    conferenceShort: string | null;
    coach: string | null;
    coachSeasons: number | null;
    // Computed from ESPN per-event closing lines vs final scores (ESPN's own
    // ATS endpoint returns empty for every season/league). Falls back to the
    // prior season when the current one has no completed games yet.
    ats: { season: number; spreadRecord: string; ouRecord: string; games: number } | null;
    leaders: { category: string; athlete: string; position: string | null; value: string; season: number }[];
    injuries: { name: string; position: string | null; status: string }[];
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
  news: { headline: string; url: string | null; published: string | null }[];
}

// Season year: Jan/Feb games (bowls, Super Bowl) belong to the prior year's
// season; from March on we point at the season starting that fall.
function currentSeason(): number {
  const now = new Date();
  return now.getUTCMonth() >= 2 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

async function resolveTeamId(cfg: LeagueConfig, team: string): Promise<string | null> {
  if (/^\d+$/.test(team)) return team;
  const data: any = await getJson(`${cfg.site}/teams?limit=1000`, DAY);
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

function parseSchedule(data: any, teamId: string, seasonType: SeasonType): ScheduleGame[] {
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
        logo: them.team?.logos?.[0]?.href ?? null,
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
      closing: null,
    });
  }
  return out;
}

interface CompletedLite { eventId: string; home: boolean; margin: number; total: number }

const toCompleted = (schedule: ScheduleGame[]): CompletedLite[] =>
  schedule
    .filter((g) => g.completed && g.teamScore !== null && g.oppScore !== null && g.seasonType !== 'preseason')
    .map((g) => ({
      eventId: g.id,
      home: g.home,
      margin: Number(g.teamScore) - Number(g.oppScore),
      total: Number(g.teamScore) + Number(g.oppScore),
    }));

// ATS + over/under record from ESPN's per-event odds (closing spread is
// home-relative: -9.5 = home favored by 9.5). Completed games never change,
// so their odds fetches cache for a week. Also returns each game's closing
// line + result keyed by event id, so schedule rows can show covered/missed.
async function computeAts(
  cfg: LeagueConfig, teamId: string, schedule: ScheduleGame[], season: number
): Promise<{ ats: TeamPayload['team']['ats']; perGame: Map<string, NonNullable<ScheduleGame['closing']>> }> {
  const perGame = new Map<string, NonNullable<ScheduleGame['closing']>>();
  let completed = toCompleted(schedule);
  let atsSeason = season;
  if (completed.length === 0) {
    // Season hasn't started — score last season instead.
    atsSeason = season - 1;
    const prior = await Promise.all(cfg.seasonTypes.map(([, st]) =>
      getJson(`${cfg.site}/teams/${teamId}/schedule?season=${atsSeason}&seasontype=${st}`, DAY)));
    completed = toCompleted(cfg.seasonTypes.flatMap(([label], i) => parseSchedule(prior[i], teamId, label)));
    if (completed.length === 0) return { ats: null, perGame };
  }

  let w = 0, l = 0, p = 0, over = 0, under = 0, ouPush = 0, games = 0;
  await Promise.all(completed.slice(0, 30).map(async (g) => {
    const o: any = await getJson(`${cfg.core}/events/${g.eventId}/competitions/${g.eventId}/odds`, 7 * DAY);
    const item = (o?.items ?? []).find((it: any) =>
      typeof it?.spread === 'number' || typeof it?.overUnder === 'number');
    if (!item) return;
    const closing: NonNullable<ScheduleGame['closing']> = { spread: null, atsRes: null, total: null, ouRes: null };
    if (typeof item.spread === 'number') {
      const teamSpread = g.home ? item.spread : -item.spread;
      const edge = g.margin + teamSpread;
      closing.spread = teamSpread;
      closing.atsRes = edge > 0 ? 'W' : edge < 0 ? 'L' : 'P';
      if (edge > 0) w++; else if (edge < 0) l++; else p++;
    }
    if (typeof item.overUnder === 'number') {
      closing.total = item.overUnder;
      closing.ouRes = g.total > item.overUnder ? 'O' : g.total < item.overUnder ? 'U' : 'P';
      if (g.total > item.overUnder) over++;
      else if (g.total < item.overUnder) under++;
      else ouPush++;
    }
    if (closing.atsRes || closing.ouRes) {
      games++;
      perGame.set(g.eventId, closing);
    }
  }));
  if (games === 0) return { ats: null, perGame };

  const rec = (a: number, b: number, push: number) => `${a}-${b}${push ? `-${push}` : ''}`;
  return {
    ats: { season: atsSeason, spreadRecord: rec(w, l, p), ouRecord: rec(over, under, ouPush), games },
    perGame,
  };
}

// Season stat leaders (passing / rushing / receiving yards) — athlete names
// live behind one $ref each.
const LEADER_CATEGORIES: [string, string][] = [
  ['passingYards', 'Passing'], ['rushingYards', 'Rushing'], ['receivingYards', 'Receiving'],
];

async function fetchLeaders(
  cfg: LeagueConfig, teamId: string, season: number
): Promise<TeamPayload['team']['leaders']> {
  const data: any = await getJson(`${cfg.core}/seasons/${season}/types/2/teams/${teamId}/leaders`, DAY);
  const cats: any[] = data?.categories ?? [];
  const out: TeamPayload['team']['leaders'] = [];
  await Promise.all(LEADER_CATEGORIES.map(async ([key, label]) => {
    const top = cats.find((c) => c?.name === key)?.leaders?.[0];
    if (!top?.displayValue) return;
    const athlete: any = top.athlete?.$ref ? await getJson(top.athlete.$ref, DAY) : null;
    if (!athlete?.displayName) return;
    out.push({
      category: label,
      athlete: athlete.displayName,
      position: athlete.position?.abbreviation ?? null,
      value: `${top.displayValue} yds`,
      season,
    });
  }));
  const order = new Map(LEADER_CATEGORIES.map(([, label], i) => [label, i]));
  return out.sort((a, b) => (order.get(a.category) ?? 9) - (order.get(b.category) ?? 9));
}

// Current injury designations from the roster (injuries come inline — the
// dedicated site injuries endpoint returns {} and the core one needs two
// fetches per entry).
async function fetchInjuries(cfg: LeagueConfig, teamId: string): Promise<TeamPayload['team']['injuries']> {
  const data: any = await getJson(`${cfg.site}/teams/${teamId}/roster`, HOUR);
  const out: TeamPayload['team']['injuries'] = [];
  for (const grp of data?.athletes ?? []) {
    for (const a of grp?.items ?? []) {
      const status = a?.injuries?.[0]?.status;
      if (!status || status === 'Active') continue;
      out.push({
        name: a.displayName ?? '?',
        position: a.position?.abbreviation ?? null,
        status,
      });
    }
  }
  // Outs first, then questionable — and keep the card short.
  const sev = (s: string) => (/(out|injured reserve|ir)/i.test(s) ? 0 : /doubtful/i.test(s) ? 1 : 2);
  return out.sort((a, b) => sev(a.status) - sev(b.status)).slice(0, 10);
}

async function fetchNews(cfg: LeagueConfig, teamId: string): Promise<TeamPayload['news']> {
  const data: any = await getJson(`${cfg.site}/news?team=${teamId}&limit=6`, HOUR);
  return (data?.articles ?? []).slice(0, 5).map((a: any) => ({
    headline: a?.headline ?? '',
    url: a?.links?.web?.href ?? null,
    published: a?.published ?? null,
  })).filter((a: { headline: string }) => a.headline);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const league = (searchParams.get('league') ?? 'ncaaf').toLowerCase();
  const cfg = LEAGUES[league];
  if (!cfg) {
    return NextResponse.json({ error: `Unsupported league: ${league}` }, { status: 400 });
  }
  const teamParam = searchParams.get('team');
  if (!teamParam) {
    return NextResponse.json({ error: 'Missing team parameter' }, { status: 400 });
  }
  const season = Number(searchParams.get('season')) || currentSeason();

  const teamId = await resolveTeamId(cfg, teamParam);
  if (!teamId) {
    return NextResponse.json({ error: `Unknown team: ${teamParam}` }, { status: 404 });
  }

  const [siteTeam, coreTeam, ...scheds] = await Promise.all([
    getJson(`${cfg.site}/teams/${teamId}`, HOUR),
    getJson(`${cfg.core}/seasons/${season}/teams/${teamId}`, DAY),
    ...cfg.seasonTypes.map(([, st]) =>
      getJson(`${cfg.site}/teams/${teamId}/schedule?season=${season}&seasontype=${st}`, HOUR)),
  ]);

  const t: any = (siteTeam as any)?.team;
  if (!t) {
    return NextResponse.json({ error: 'Team lookup failed' }, { status: 502 });
  }

  // Conference/division, coach, and full venue live behind core-API $refs.
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

  const schedule = cfg.seasonTypes
    .flatMap(([label], i) => parseSchedule(scheds[i], teamId, label))
    .sort((a, b) => a.date.localeCompare(b.date));

  const [{ ats, perGame }, injuries, news] = await Promise.all([
    computeAts(cfg, teamId, schedule, season),
    fetchInjuries(cfg, teamId),
    fetchNews(cfg, teamId),
  ]);
  // Leaders come from the season the ATS record covers (current until games
  // play, then this season) so the card is never empty in the offseason.
  const leaders = await fetchLeaders(cfg, teamId, ats?.season ?? season);
  for (const g of schedule) {
    g.closing = perGame.get(g.id) ?? null;
  }

  const payload: TeamPayload = {
    team: {
      id: teamId,
      displayName: t.displayName ?? '?',
      nickname: t.nickname ?? null,
      abbreviation: t.abbreviation ?? null,
      location: t.location ?? null,
      logo: t.logos?.[0]?.href ?? null,
      color: t.color ?? null,
      alternateColor: t.alternateColor ?? null,
      record,
      standingSummary: t.standingSummary ?? null,
      conference: (group as any)?.name ?? null,
      conferenceShort: (group as any)?.shortName ?? null,
      coach,
      coachSeasons,
      ats,
      leaders,
      injuries,
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
    news,
  };

  return NextResponse.json(payload);
}
