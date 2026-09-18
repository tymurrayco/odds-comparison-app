// src/lib/nfl/snapshots.ts

/**
 * Weekly snapshots of the NFL futures picture (src/lib/nfl/futures.ts)
 * plus the books' Super Bowl outrights from the Odds API, keyed by the
 * number of completed NFL weeks. The daily cron writes only when the
 * current week has no rows yet; `force` rewrites it. Division and
 * conference rows have no market counterpart.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { NFL_DEFAULT_HFA } from './constants';
import { buildNflFutures } from './futures';
import { fetchNflSosSchedule } from './sos';
import { loadNflConfig, loadNflRatings } from './supabase';
import { NflTeamRating } from './types';
import { SosInputGame } from '@/lib/sos';
import { normalizeName } from '@/lib/fbs/teamNames';

export const NFL_SNAPSHOT_BOOKS = ['draftkings', 'fanduel', 'betmgm', 'betrivers', 'caesars'];
const OUTRIGHTS_SPORT = 'americanfootball_nfl_super_bowl_winner';

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

export interface NflSnapshotRow {
  season: number;
  week: number;
  taken_at?: string;
  source: 'futures' | 'market';
  division: string | null;
  conference: string | null;
  team_name: string;
  rating: number | null;
  wins: number | null;
  losses: number | null;
  ties: number | null;
  proj_wins: number | null;
  proj_losses: number | null;
  div_prob: number | null;
  playoff_prob: number | null;
  seed1_prob: number | null;
  conf_prob: number | null;
  sb_prob: number | null;
  div_odds: number | null;
  timing_signal: string | null;
  market_book: string | null;
  market_odds: number | null;
  market_prob: number | null;
}

export function completedNflWeek(schedule: SosInputGame[]): number {
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

async function fetchMarketRows(
  season: number,
  week: number,
  ratings: Map<string, NflTeamRating>
): Promise<{ rows: NflSnapshotRow[]; unmatched: string[]; remaining: string | null }> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return { rows: [], unmatched: [], remaining: null };
  const url = `https://api.the-odds-api.com/v4/sports/${OUTRIGHTS_SPORT}/odds?apiKey=${apiKey}&regions=us&markets=outrights&oddsFormat=american&bookmakers=${NFL_SNAPSHOT_BOOKS.join(',')}`;
  const res = await fetch(url);
  const remaining = res.headers.get('x-requests-remaining');
  if (!res.ok) throw new Error(`Odds API outrights HTTP ${res.status}`);
  const events: OutrightEvent[] = await res.json();

  const byNorm = new Map<string, NflTeamRating>();
  for (const r of ratings.values()) {
    for (const n of [r.teamName, r.espnName, r.seedName]) if (n) byNorm.set(normalizeName(n), r);
  }
  const resolve = (name: string): NflTeamRating | null => {
    const n = normalizeName(name);
    const hit = byNorm.get(n);
    if (hit) return hit;
    const last = n.split(' ').pop() ?? '';
    const cands = [...ratings.values()].filter((r) => normalizeName(r.teamName).endsWith(` ${last}`));
    return cands.length === 1 ? cands[0] : null;
  };

  const rows: NflSnapshotRow[] = [];
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
          division: team.conference, conference: team.conference?.slice(0, 3) ?? null,
          team_name: team.teamName,
          rating: null, wins: null, losses: null, ties: null, proj_wins: null, proj_losses: null,
          div_prob: null, playoff_prob: null, seed1_prob: null, conf_prob: null, sb_prob: null,
          div_odds: null, timing_signal: null,
          market_book: bk.key,
          market_odds: o.price,
          market_prob: Math.round((impliedProb(o.price) / hold) * 100000) / 100000,
        });
      }
    }
  }
  return { rows, unmatched: [...unmatched], remaining };
}

export interface NflSnapshotReport {
  season: number;
  week: number;
  written: Record<string, number>;
  skipped: string[];
  unmatchedMarketNames: string[];
  oddsApiRemaining: string | null;
}

export async function takeNflSnapshot(season: number, force = false): Promise<NflSnapshotReport> {
  const [config, ratings, schedule] = await Promise.all([loadNflConfig(), loadNflRatings(season), fetchNflSosSchedule(season)]);
  const week = completedNflWeek(schedule);
  const hfa = config.hfaDefault ?? NFL_DEFAULT_HFA;

  const { data: existing, error: exErr } = await sb().from('nfl_futures_snapshots').select('source').eq('season', season).eq('week', week);
  if (exErr) throw new Error(`nfl_futures_snapshots: ${exErr.message} (run sql/nfl_futures_snapshots.sql)`);
  const have = new Set((existing ?? []).map((r) => r.source as string));

  const written: Record<string, number> = {};
  const skipped: string[] = [];
  let unmatched: string[] = [];
  let remaining: string | null = null;

  const write = async (source: string, rows: NflSnapshotRow[]) => {
    if (!rows.length) { written[source] = 0; return; }
    if (force && have.has(source)) {
      const { error } = await sb().from('nfl_futures_snapshots').delete().eq('season', season).eq('week', week).eq('source', source);
      if (error) throw new Error(error.message);
    }
    const { error } = await sb().from('nfl_futures_snapshots').insert(rows);
    if (error) throw new Error(`${source}: ${error.message}`);
    written[source] = rows.length;
  };

  if (force || !have.has('futures')) {
    const fut = buildNflFutures(season, schedule, ratings, hfa);
    const rows: NflSnapshotRow[] = fut.teams.map((t) => ({
      season, week, source: 'futures' as const,
      division: t.division, conference: t.conference,
      team_name: t.teamName,
      rating: t.rating, wins: t.wins, losses: t.losses, ties: t.ties, proj_wins: t.projWins, proj_losses: t.projLosses,
      div_prob: t.pDiv, playoff_prob: t.pPlayoff, seed1_prob: t.pSeed1, conf_prob: t.pConf, sb_prob: t.pSb,
      div_odds: t.divOdds, timing_signal: t.timing?.signal ?? null,
      market_book: null, market_odds: null, market_prob: null,
    }));
    await write('futures', rows);
  } else skipped.push('futures');

  if (force || !have.has('market')) {
    const m = await fetchMarketRows(season, week, ratings);
    unmatched = m.unmatched;
    remaining = m.remaining;
    await write('market', m.rows);
  } else skipped.push('market');

  return { season, week, written, skipped, unmatchedMarketNames: unmatched, oddsApiRemaining: remaining };
}

export async function loadNflSnapshots(season: number): Promise<NflSnapshotRow[]> {
  const out: NflSnapshotRow[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await sb()
      .from('nfl_futures_snapshots')
      .select('*')
      .eq('season', season)
      .order('week', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + page - 1);
    if (error) throw new Error(`nfl_futures_snapshots: ${error.message} (run sql/nfl_futures_snapshots.sql)`);
    out.push(...((data ?? []) as NflSnapshotRow[]));
    if (!data || data.length < page) break;
  }
  return out;
}
