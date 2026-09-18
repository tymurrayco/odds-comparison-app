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
}

/** Completed regular-season weeks so far (0 before the opener). */
export function completedCfbWeek(schedule: ScheduleGame[]): number {
  let w = 0;
  for (const g of schedule) {
    if (g.completed && g.homeScore !== null && g.awayScore !== null && g.week && g.week > w) w = g.week;
  }
  return w;
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
  const week = completedCfbWeek(schedule);
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
  let unmatched: string[] = [];
  let remaining: string | null = null;

  const write = async (source: string, rows: SnapshotRow[]) => {
    if (!rows.length) { written[source] = 0; return; }
    if (force && have.has(source)) {
      const { error } = await sb().from('fbs_futures_snapshots').delete().eq('season', season).eq('week', week).eq('source', source);
      if (error) throw new Error(error.message);
    }
    const { error } = await sb().from('fbs_futures_snapshots').insert(rows);
    if (error) throw new Error(`${source}: ${error.message}`);
    written[source] = rows.length;
  };

  if (force || !have.has('futures')) {
    const fut = buildFutures(season, schedule, fbs, fcs, hfa);
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
      }))
    );
    await write('futures', rows);
  } else skipped.push('futures');

  if (force || !have.has('g5')) {
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
  } else skipped.push('g5');

  if (force || !have.has('market')) {
    const m = await fetchMarketRows(season, week, fbs);
    unmatched = m.unmatched;
    remaining = m.remaining;
    await write('market', m.rows);
  } else skipped.push('market');

  return { season, week, written, skipped, unmatchedMarketNames: unmatched, oddsApiRemaining: remaining };
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
