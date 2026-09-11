// src/lib/football/boxScores.ts

/**
 * Box-score sync for the totals model: one row per team per completed game
 * (points, plays, yards, possession) parsed from ESPN's event summary.
 *
 * Plays: NFL box scores carry totalOffensivePlays. College ones don't, so
 * plays = pass attempts + rush attempts — NCAA counts sacks as rushing
 * attempts, so that is the official plays figure. Points come from the
 * scoreboard event (the summary's header carries the same numbers).
 *
 * Storage: football_game_stats (sql/football_game_stats.sql), keyed by
 * (league, game_id, team_espn_id). Both sides of a game are written together
 * so a differential is always computable from one query.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type FootballLeague = 'nfl' | 'ncaaf';

export const LEAGUE_SITE_BASE: Record<FootballLeague, string> = {
  nfl: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl',
  ncaaf: 'https://site.api.espn.com/apis/site/v2/sports/football/college-football',
};

export interface TeamGameStats {
  league: FootballLeague;
  gameId: string;
  teamEspnId: string;
  teamName: string;
  opponentEspnId: string;
  opponentName: string;
  gameDate: string;
  season: number;
  seasonType: number; // 1 pre, 2 regular, 3 post
  isHome: boolean;
  isNeutral: boolean;
  points: number;
  oppPoints: number;
  plays: number | null;
  totalYards: number | null;
  passAttempts: number | null;
  rushAttempts: number | null;
  netPassingYards: number | null;
  rushingYards: number | null;
  firstDowns: number | null;
  turnovers: number | null;
  possessionSeconds: number | null;
}

export interface ScoreboardGame {
  id: string;
  date: string;
  season: number;
  seasonType: number;
  isNeutral: boolean;
  completed: boolean;
  home: { id: string; name: string; score: number };
  away: { id: string; name: string; score: number };
}

/* eslint-disable @typescript-eslint/no-explicit-any */

let supabase: SupabaseClient | null = null;
function getClient(): SupabaseClient {
  if (!supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Supabase credentials missing');
    supabase = createClient(url, key);
  }
  return supabase;
}

// ---------- ESPN ----------

function parseScoreboardEvents(json: any): ScoreboardGame[] {
  const out: ScoreboardGame[] = [];
  for (const event of json?.events ?? []) {
    const comp = event.competitions?.[0];
    if (!comp) continue;
    const home = comp.competitors?.find((c: any) => c.homeAway === 'home');
    const away = comp.competitors?.find((c: any) => c.homeAway === 'away');
    if (!home?.team || !away?.team) continue;
    // Pro Bowl (AFC vs NFC) sits in the postseason feed with no box score
    if (/^(AFC|NFC)$/.test(home.team.displayName ?? '') || /^(AFC|NFC)$/.test(away.team.displayName ?? '')) continue;
    out.push({
      id: String(event.id),
      date: comp.date ?? event.date,
      season: Number(event.season?.year ?? comp.season?.year ?? 0),
      seasonType: Number(event.season?.type ?? comp.season?.type ?? 2),
      isNeutral: comp.neutralSite === true || comp.venue?.neutral === true,
      completed: comp.status?.type?.completed === true,
      home: { id: String(home.team.id), name: home.team.displayName ?? '', score: Number(home.score ?? NaN) },
      away: { id: String(away.team.id), name: away.team.displayName ?? '', score: Number(away.score ?? NaN) },
    });
  }
  return out;
}

/**
 * Completed games in a date window. The NFL feed takes a YYYYMMDD-YYYYMMDD
 * range in one call; college needs a day at a time (groups=80 FBS, 81 FCS —
 * both fetched so cross-division games land once, deduped by id).
 */
export async function fetchCompletedGames(
  league: FootballLeague,
  startYmd: string,
  endYmd: string
): Promise<ScoreboardGame[]> {
  const base = LEAGUE_SITE_BASE[league];
  const ymd = (s: string) => s.replace(/-/g, '');
  if (league === 'nfl') {
    const res = await fetch(`${base}/scoreboard?dates=${ymd(startYmd)}-${ymd(endYmd)}&limit=1000`);
    if (!res.ok) throw new Error(`ESPN scoreboard HTTP ${res.status}`);
    return parseScoreboardEvents(await res.json()).filter((g) => g.completed);
  }
  const byId = new Map<string, ScoreboardGame>();
  const d = new Date(`${startYmd}T00:00:00Z`);
  const end = new Date(`${endYmd}T00:00:00Z`);
  while (d <= end) {
    const day = ymd(d.toISOString().substring(0, 10));
    for (const group of ['80', '81']) {
      const res = await fetch(`${base}/scoreboard?dates=${day}&groups=${group}&limit=300`);
      if (!res.ok) continue;
      for (const g of parseScoreboardEvents(await res.json())) {
        if (g.completed) byId.set(g.id, g);
      }
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return [...byId.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function statMap(side: any): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of side?.statistics ?? []) if (s?.name) out[s.name] = String(s.displayValue ?? '');
  return out;
}

const num = (v: string | undefined): number | null => {
  if (v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// "20/37" -> 37 ; "33:50" -> 2030
const attemptsOf = (v: string | undefined): number | null => num(v?.split('/')[1]);
const secondsOf = (v: string | undefined): number | null => {
  if (!v) return null;
  const [m, s] = v.split(':').map(Number);
  return Number.isFinite(m) && Number.isFinite(s) ? m * 60 + s : null;
};

function sideStats(stats: Record<string, string>) {
  const passAttempts = attemptsOf(stats.completionAttempts);
  const rushAttempts = num(stats.rushingAttempts);
  let plays = num(stats.totalOffensivePlays);
  if (plays === null && passAttempts !== null && rushAttempts !== null) {
    plays = passAttempts + rushAttempts;
  }
  return {
    plays,
    totalYards: num(stats.totalYards),
    passAttempts,
    rushAttempts,
    netPassingYards: num(stats.netPassingYards),
    rushingYards: num(stats.rushingYards),
    firstDowns: num(stats.firstDowns),
    turnovers: num(stats.turnovers),
    possessionSeconds: secondsOf(stats.possessionTime),
  };
}

/** One summary fetch -> both teams' rows (null if the box score is missing). */
export async function fetchGameStats(
  league: FootballLeague,
  game: ScoreboardGame
): Promise<TeamGameStats[] | null> {
  const res = await fetch(`${LEAGUE_SITE_BASE[league]}/summary?event=${game.id}`);
  if (!res.ok) throw new Error(`ESPN summary HTTP ${res.status} for ${game.id}`);
  const json = await res.json();
  const teams: any[] = json?.boxscore?.teams ?? [];
  const homeSide = teams.find((t) => String(t?.team?.id) === game.home.id);
  const awaySide = teams.find((t) => String(t?.team?.id) === game.away.id);
  if (!homeSide || !awaySide) return null;
  if (!Number.isFinite(game.home.score) || !Number.isFinite(game.away.score)) return null;
  const common = {
    league,
    gameId: game.id,
    gameDate: game.date,
    season: game.season,
    seasonType: game.seasonType,
    isNeutral: game.isNeutral,
  };
  return [
    {
      ...common,
      teamEspnId: game.home.id,
      teamName: game.home.name,
      opponentEspnId: game.away.id,
      opponentName: game.away.name,
      isHome: true,
      points: game.home.score,
      oppPoints: game.away.score,
      ...sideStats(statMap(homeSide)),
    },
    {
      ...common,
      teamEspnId: game.away.id,
      teamName: game.away.name,
      opponentEspnId: game.home.id,
      opponentName: game.home.name,
      isHome: false,
      points: game.away.score,
      oppPoints: game.home.score,
      ...sideStats(statMap(awaySide)),
    },
  ];
}

// ---------- Supabase ----------

const PAGE = 1000;

/** Game ids already stored for a league + season. */
export async function loadStoredGameIds(league: FootballLeague, season: number): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await getClient()
      .from('football_game_stats')
      .select('game_id')
      .eq('league', league)
      .eq('season', season)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`loadStoredGameIds: ${error.message}`);
    for (const row of data ?? []) ids.add(row.game_id);
    if (!data || data.length < PAGE) break;
  }
  return ids;
}

export async function upsertGameStats(rows: TeamGameStats[]): Promise<void> {
  if (rows.length === 0) return;
  const now = new Date().toISOString();
  const { error } = await getClient().from('football_game_stats').upsert(
    rows.map((r) => ({
      league: r.league,
      game_id: r.gameId,
      team_espn_id: r.teamEspnId,
      team_name: r.teamName,
      opponent_espn_id: r.opponentEspnId,
      opponent_name: r.opponentName,
      game_date: r.gameDate,
      season: r.season,
      season_type: r.seasonType,
      is_home: r.isHome,
      is_neutral: r.isNeutral,
      points: r.points,
      opp_points: r.oppPoints,
      plays: r.plays,
      total_yards: r.totalYards,
      pass_attempts: r.passAttempts,
      rush_attempts: r.rushAttempts,
      net_passing_yards: r.netPassingYards,
      rushing_yards: r.rushingYards,
      first_downs: r.firstDowns,
      turnovers: r.turnovers,
      possession_seconds: r.possessionSeconds,
      fetched_at: now,
    })),
    { onConflict: 'league,game_id,team_espn_id' }
  );
  if (error) throw new Error(`upsertGameStats: ${error.message}`);
}

/** Every stored row for a league + season (both sides of every game). */
export async function loadSeasonStats(league: FootballLeague, season: number): Promise<TeamGameStats[]> {
  const out: TeamGameStats[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await getClient()
      .from('football_game_stats')
      .select('*')
      .eq('league', league)
      .eq('season', season)
      .order('game_date', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`loadSeasonStats: ${error.message}`);
    for (const r of data ?? []) {
      out.push({
        league: r.league,
        gameId: r.game_id,
        teamEspnId: r.team_espn_id,
        teamName: r.team_name,
        opponentEspnId: r.opponent_espn_id,
        opponentName: r.opponent_name,
        gameDate: r.game_date,
        season: r.season,
        seasonType: r.season_type,
        isHome: r.is_home,
        isNeutral: r.is_neutral,
        points: r.points,
        oppPoints: r.opp_points,
        plays: r.plays,
        totalYards: r.total_yards,
        passAttempts: r.pass_attempts,
        rushAttempts: r.rush_attempts,
        netPassingYards: r.net_passing_yards,
        rushingYards: r.rushing_yards,
        firstDowns: r.first_downs,
        turnovers: r.turnovers,
        possessionSeconds: r.possession_seconds,
      });
    }
    if (!data || data.length < PAGE) break;
  }
  return out;
}

// ---------- sync ----------

export interface BoxScoreSyncResult {
  league: FootballLeague;
  season: number;
  range: { startDate: string; endDate: string };
  completedInWindow: number;
  alreadyStored: number;
  stored: number;
  remaining: number; // completed games still missing after this batch (maxGames cap)
  failed: Array<{ game: string; error: string }>;
}

/**
 * Store box scores for completed games in [startYmd, endYmd] that aren't in
 * the table yet, up to maxGames per call (each is a ~550KB ESPN fetch; a
 * Vercel call has 60s). Small concurrency so ESPN doesn't 403 the burst.
 */
export async function syncBoxScores(
  league: FootballLeague,
  season: number,
  startYmd: string,
  endYmd: string,
  maxGames = 40,
  concurrency = 4
): Promise<BoxScoreSyncResult> {
  const [games, stored] = await Promise.all([
    fetchCompletedGames(league, startYmd, endYmd),
    loadStoredGameIds(league, season),
  ]);
  const missing = games.filter((g) => !stored.has(g.id));
  const batch = missing.slice(0, maxGames);
  const failed: BoxScoreSyncResult['failed'] = [];
  let storedCount = 0;

  let cursor = 0;
  const worker = async () => {
    while (cursor < batch.length) {
      const g = batch[cursor++];
      const label = `${g.away.name} @ ${g.home.name} (${g.date.substring(0, 10)})`;
      try {
        const rows = await fetchGameStats(league, { ...g, season: g.season || season });
        if (!rows) {
          failed.push({ game: label, error: 'no box score in summary' });
          continue;
        }
        await upsertGameStats(rows);
        storedCount++;
      } catch (e) {
        failed.push({ game: label, error: e instanceof Error ? e.message : String(e) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, batch.length) }, worker));

  return {
    league,
    season,
    range: { startDate: startYmd, endDate: endYmd },
    completedInWindow: games.length,
    alreadyStored: games.length - missing.length,
    stored: storedCount,
    remaining: missing.length - storedCount - failed.length,
    failed,
  };
}
