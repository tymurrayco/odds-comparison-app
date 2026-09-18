// src/lib/fbs/snapshots.ts

/**
 * Weekly snapshots of the FBS futures picture, so odds and projections can
 * be watched as the season unfolds:
 *   - 'futures': the conference-title sim (every FBS team)
 *   - 'g5':      the Group of Five playoff sim
 *   - 'market':  the books' national-title outrights from the Odds API
 *                (one row per team per book, hold removed)
 * Conference and G5 rows have no market counterpart — the books don't post
 * those markets — so their market columns stay null.
 *
 * A snapshot is keyed by the number of completed CFB weeks; the daily cron
 * only writes when that week hasn't been captured yet, so the table gets
 * one snapshot per week no matter how often the cron fires.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { FBS_DEFAULT_HFA } from './constants';
import { buildFutures, fetchFbsSeasonSchedule, ScheduleGame } from './futures';
import { buildG5Playoff } from './g5Playoff';
import { buildFbsSos } from './sos';
import { normalizeName } from './teamNames';
import { loadFbsConfig, loadFbsRatings } from './supabase';
import { loadFcsRatings } from '@/lib/fcs/supabase';
import { FbsTeamRating } from './types';

export const SNAPSHOT_MARKET_BOOKS = ['draftkings', 'fanduel', 'betmgm', 'betrivers', 'caesars'];
const OUTRIGHTS_SPORT = 'americanfootball_ncaaf_championship_winner';

let client: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Supabase env missing');
    client = createClient(url, key);
  }
  return client;
}

export interface SnapshotRow {
  season: number;
  week: number;
  taken_at?: string;
  source: 'futures' | 'g5' | 'market';
  conference: string | null;
  team_name: string;
  rating: number | null;
  wins: number | null;
  losses: number | null;
  proj_wins: number | null;
  proj_losses: number | null;
  title_prob: number | null;
  ccg_prob: number | null;
  top2_prob: number | null;
  champ_prob: number | null;
  playoff_prob: number | null;
  fair_odds: number | null;
  timing_signal: string | null;
  market_book: string | null;
  market_odds: number | null;
  market_prob: number | null;
  games_started?: number;    // games of the NEXT week already under way at capture (0 = clean pre-week snapshot)
  sos_pct?: number | null;           // futures rows: median-team win % over the full slate (lower = harder)
  sos_remaining_pct?: number | null; // futures rows: same over unplayed games only
}

/** Median-team win % over a team's rated games (all, and unplayed only) — the SOS tab's headline numbers. */
export function sosAggregates(games: { pWin: number | null; completed: boolean }[]): { sosPct: number | null; sosRemainingPct: number | null } {
  let n = 0, sum = 0, rn = 0, rsum = 0;
  for (const g of games) {
    if (g.pWin === null) continue;
    n++; sum += g.pWin;
    if (!g.completed) { rn++; rsum += g.pWin; }
  }
  const r4 = (x: number) => Math.round(x * 10000) / 10000;
  return { sosPct: n ? r4(sum / n) : null, sosRemainingPct: rn ? r4(rsum / rn) : null };
}

/** Completed regular-season weeks so far (0 before the opener). */
export function completedCfbWeek(schedule: ScheduleGame[]): number {
  return weekStatus(schedule).completedWeek;
}

export interface WeekStatus {
  completedWeek: number;   // highest week whose games are ALL final (0 before the opener)
  nextWeek: number;        // the week about to be played
  gamesStarted: number;    // games of nextWeek that have kicked off or finished
  gamesInWeek: number;
  locked: boolean;         // a snapshot keyed to completedWeek must not be rewritten
}

/**
 * A week counts as complete only when every game in it is final, so one
 * Thursday or Friday game can't bump the key. Once any game of the next
 * week has started, the pre-week snapshot is locked: the season state it
 * captured is gone and a rewrite would mix in partial results.
 */
export function weekStatus(schedule: { week: number | null; date: string; completed: boolean; homeScore: number | null; awayScore: number | null }[], now: Date = new Date()): WeekStatus {
  const byWeek = new Map<number, { total: number; done: number; started: number }>();
  for (const g of schedule) {
    if (!g.week || g.week > 15) continue;
    const w = byWeek.get(g.week) ?? { total: 0, done: 0, started: 0 };
    w.total++;
    const done = g.completed && g.homeScore !== null && g.awayScore !== null;
    if (done) w.done++;
    if (done || new Date(g.date).getTime() <= now.getTime()) w.started++;
    byWeek.set(g.week, w);
  }
  let completedWeek = 0;
  for (const [w, s] of [...byWeek.entries()].sort((a, b) => a[0] - b[0])) {
    if (s.total > 0 && s.done === s.total) completedWeek = w;
    else break;
  }
  const nextWeek = completedWeek + 1;
  const nx = byWeek.get(nextWeek) ?? { total: 0, done: 0, started: 0 };
  return { completedWeek, nextWeek, gamesStarted: nx.started, gamesInWeek: nx.total, locked: nx.started > 0 };
}

const impliedProb = (american: number): number =>
  american > 0 ? 100 / (american + 100) : -american / (-american + 100);

interface OutrightEvent {
  bookmakers?: Array<{ key: string; markets?: Array<{ key: string; outcomes?: Array<{ name: string; price: number }> }> }>;
}

/** Books' national-title outrights, matched to canonical FBS names, hold removed per book. */
async function fetchMarketRows(
  season: number,
  week: number,
  ratings: Map<string, FbsTeamRating>
): Promise<{ rows: SnapshotRow[]; unmatched: string[]; remaining: string | null }> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return { rows: [], unmatched: [], remaining: null };
  const url = `https://api.the-odds-api.com/v4/sports/${OUTRIGHTS_SPORT}/odds?apiKey=${apiKey}&regions=us&markets=outrights&oddsFormat=american&bookmakers=${SNAPSHOT_MARKET_BOOKS.join(',')}`;
  const res = await fetch(url);
  const remaining = res.headers.get('x-requests-remaining');
  if (!res.ok) throw new Error(`Odds API outrights HTTP ${res.status}`);
  const events: OutrightEvent[] = await res.json();

  // ESPN display names ("Ohio State Buckeyes") are what the books use
  const byNorm = new Map<string, FbsTeamRating>();
  const byCompact: Array<[string, FbsTeamRating]> = [];
  for (const r of ratings.values()) {
    for (const n of [r.espnName, r.teamName]) {
      if (!n) continue;
      byNorm.set(normalizeName(n), r);
      byCompact.push([normalizeName(n).replace(/ /g, ''), r]);
    }
  }
  const resolve = (name: string): FbsTeamRating | null => {
    const n = normalizeName(name);
    const hit = byNorm.get(n);
    if (hit) return hit;
    const c = n.replace(/ /g, '');
    const partial = byCompact.filter(([k]) => k.length >= 8 && (c.includes(k) || k.includes(c)));
    return partial.length === 1 ? partial[0][1] : null;
  };

  const rows: SnapshotRow[] = [];
  const unmatched = new Set<string>();
  for (const ev of events) {
    for (const bk of ev.bookmakers ?? []) {
      const market = bk.markets?.find((m) => m.key === 'outrights');
      const outcomes = (market?.outcomes ?? []).filter((o) => typeof o.price === 'number');
      if (!outcomes.length) continue;
      const hold = outcomes.reduce((s, o) => s + impliedProb(o.price), 0);
      for (const o of outcomes) {
        const team = resolve(o.name);
        if (!team) { unmatched.add(o.name); continue; }
        rows.push({
          season, week, source: 'market',
          conference: team.conference,
          team_name: team.teamName,
          rating: null, wins: null, losses: null, proj_wins: null, proj_losses: null,
          title_prob: null, ccg_prob: null, top2_prob: null, champ_prob: null, playoff_prob: null,
          fair_odds: null, timing_signal: null,
          market_book: bk.key,
          market_odds: o.price,
          market_prob: Math.round((impliedProb(o.price) / hold) * 100000) / 100000,
        });
      }
    }
  }
  return { rows, unmatched: [...unmatched], remaining };
}

export interface SnapshotReport {
  season: number;
  week: number;
  nextWeek: number;
  gamesStarted: number;
  locked: boolean;
  refused: string[];        // sources not rewritten because the week is locked
  written: Record<string, number>;
  skipped: string[];
  unmatchedMarketNames: string[];
  oddsApiRemaining: string | null;
}

/**
 * Capture this week's futures, G5 and market rows. Each source is written
 * only if it has no rows for (season, week) yet, unless `force`.
 */
export async function takeSnapshot(season: number, force = false): Promise<SnapshotReport> {
  const [config, fbs, fcs, schedule] = await Promise.all([
    loadFbsConfig(),
    loadFbsRatings(season),
    loadFcsRatings(),
    fetchFbsSeasonSchedule(season),
  ]);
  const status = weekStatus(schedule);
  const week = status.completedWeek;
  const hfa = config.hfaDefault ?? FBS_DEFAULT_HFA;

  const { data: existing, error: exErr } = await sb()
    .from('fbs_futures_snapshots')
    .select('source')
    .eq('season', season)
    .eq('week', week);
  if (exErr) throw new Error(`fbs_futures_snapshots: ${exErr.message} (run sql/fbs_futures_snapshots.sql)`);
  const have = new Set((existing ?? []).map((r) => r.source as string));

  const written: Record<string, number> = {};
  const skipped: string[] = [];
  const refused: string[] = [];
  let unmatched: string[] = [];
  let remaining: string | null = null;

  // A source is written when the week has no rows for it. With `force` it is
  // rewritten too — unless the week is locked (next week's games have begun).
  const shouldWrite = (source: string): boolean => {
    if (!have.has(source)) return true;
    if (!force) { skipped.push(source); return false; }
    if (status.locked) { refused.push(source); return false; }
    return true;
  };
  const write = async (source: string, rows: SnapshotRow[]) => {
    if (!rows.length) { written[source] = 0; return; }
    for (const r of rows) r.games_started = status.gamesStarted;
    if (have.has(source)) {
      const { error } = await sb().from('fbs_futures_snapshots').delete().eq('season', season).eq('week', week).eq('source', source);
      if (error) throw new Error(error.message);
    }
    let { error } = await sb().from('fbs_futures_snapshots').insert(rows);
    // Table predates a column we write (games_started, sos_*…): strip the
    // named column and retry, so a missed ALTER never blocks the weekly capture.
    let attempt = 0;
    let body: Record<string, unknown>[] = rows as unknown as Record<string, unknown>[];
    while (error && attempt < 4) {
      const m = /'([a-z_]+)' column/.exec(error.message);
      if (!m) break;
      const col = m[1];
      body = body.map((r) => { const c = { ...r }; delete c[col]; return c; });
      ({ error } = await sb().from('fbs_futures_snapshots').insert(body));
      attempt++;
    }
    if (error) throw new Error(`${source}: ${error.message}`);
    written[source] = rows.length;
  };

  if (shouldWrite('futures')) {
    const fut = buildFutures(season, schedule, fbs, fcs, hfa);
    const sos = new Map(buildFbsSos(season, schedule, fbs, fcs, hfa).teams.map((t) => [t.teamName, sosAggregates(t.games)]));
    const rows: SnapshotRow[] = fut.conferences.flatMap((c) =>
      c.teams.map((t) => ({
        season, week, source: 'futures' as const,
        conference: c.name,
        team_name: t.teamName,
        rating: t.rating, wins: t.wins, losses: t.losses, proj_wins: t.projWins, proj_losses: t.projLosses,
        title_prob: t.titleProb, ccg_prob: t.ccgProb, top2_prob: t.top2Prob,
        champ_prob: null, playoff_prob: null,
        fair_odds: t.odds, timing_signal: t.timing?.signal ?? null,
        market_book: null, market_odds: null, market_prob: null,
        sos_pct: sos.get(t.teamName)?.sosPct ?? null,
        sos_remaining_pct: sos.get(t.teamName)?.sosRemainingPct ?? null,
      }))
    );
    await write('futures', rows);
  }

  if (shouldWrite('g5')) {
    const g5 = buildG5Playoff(season, schedule, fbs, fcs, hfa);
    const rows: SnapshotRow[] = g5.teams.map((t) => ({
      season, week, source: 'g5' as const,
      conference: t.conference,
      team_name: t.teamName,
      rating: t.rating, wins: t.wins, losses: t.losses, proj_wins: t.projWins, proj_losses: t.projLosses,
      title_prob: null, ccg_prob: null, top2_prob: null,
      champ_prob: t.pChamp, playoff_prob: t.pPlayoff,
      fair_odds: t.odds, timing_signal: t.timing?.signal ?? null,
      market_book: null, market_odds: null, market_prob: null,
    }));
    await write('g5', rows);
  }

  if (shouldWrite('market')) {
    const m = await fetchMarketRows(season, week, fbs);
    unmatched = m.unmatched;
    remaining = m.remaining;
    await write('market', m.rows);
  }

  return {
    season, week, nextWeek: status.nextWeek, gamesStarted: status.gamesStarted, locked: status.locked, refused,
    written, skipped, unmatchedMarketNames: unmatched, oddsApiRemaining: remaining,
  };
}

export async function loadSnapshots(season: number): Promise<SnapshotRow[]> {
  const out: SnapshotRow[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await sb()
      .from('fbs_futures_snapshots')
      .select('*')
      .eq('season', season)
      .order('week', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + page - 1);
    if (error) throw new Error(`fbs_futures_snapshots: ${error.message} (run sql/fbs_futures_snapshots.sql)`);
    out.push(...((data ?? []) as SnapshotRow[]));
    if (!data || data.length < page) break;
  }
  return out;
}
