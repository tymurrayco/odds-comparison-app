// src/lib/lineOpeners.ts
//
// Open/close capture for the odds table's Open (pre-game) and Close (after
// kickoff) columns. The first time the app sees a football game with spreads
// posted, its consensus spread (same all-book average the Ledger chip
// compares against) is stored in game_line_openers as the opener; every
// later pre-kickoff sighting overwrites close_home_spread, so the last line
// seen before kickoff is the close. Missing table/columns or write errors
// are swallowed — the odds route must never fail over this.

import { createClient } from '@supabase/supabase-js';

export const LINE_OPENER_SPORTS = new Set(['americanfootball_nfl', 'americanfootball_ncaaf']);

interface OddsGame {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: Array<{ markets: Array<{ key: string; outcomes: Array<{ name: string; point?: number }> }> }>;
}

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/** Consensus home spread across books (average away point, negated), or null. */
export function consensusHomeSpread(game: OddsGame): number | null {
  const pts = (game.bookmakers ?? [])
    .map((b) => b.markets.find((m) => m.key === 'spreads')?.outcomes.find((o) => o.name === game.away_team)?.point)
    .filter((p): p is number => typeof p === 'number');
  return pts.length ? -(pts.reduce((a, b) => a + b, 0) / pts.length) : null;
}

// Page loads hit /api/odds constantly; one write attempt per sport per lambda
// every few minutes is plenty to catch new games.
const lastCapture = new Map<string, number>();
const THROTTLE_MS = 3 * 60 * 1000;

export async function captureLineOpeners(sport: string, games: OddsGame[], force = false): Promise<number> {
  if (!LINE_OPENER_SPORTS.has(sport) || !Array.isArray(games)) return 0;
  if (!force && Date.now() - (lastCapture.get(sport) ?? 0) < THROTTLE_MS) return 0;
  lastCapture.set(sport, Date.now());
  const now = Date.now();
  const rows = [];
  for (const g of games) {
    if (new Date(g.commence_time).getTime() <= now) continue; // never "open" a game under way
    const spread = consensusHomeSpread(g);
    if (spread === null) continue;
    const books = (g.bookmakers ?? []).filter((b) => b.markets.some((m) => m.key === 'spreads')).length;
    rows.push({
      event_id: g.id,
      sport_key: sport,
      home_team: g.home_team,
      away_team: g.away_team,
      commence_time: g.commence_time,
      home_spread: Math.round(spread * 100) / 100,
      books,
    });
  }
  if (!rows.length) return 0;
  try {
    const db = sb();
    // Keep existing openers; refresh the close on every pre-kickoff sighting
    const { data: existing, error: readErr } = await db
      .from('game_line_openers')
      .select('event_id, home_spread, books, captured_at')
      .in('event_id', rows.map((r) => r.event_id));
    if (!readErr) {
      const prev = new Map((existing ?? []).map((e) => [e.event_id as string, e]));
      const seenAt = new Date().toISOString();
      const { error } = await db.from('game_line_openers').upsert(
        rows.map((r) => {
          const p = prev.get(r.event_id);
          return {
            ...r,
            ...(p ? { home_spread: p.home_spread, books: p.books, captured_at: p.captured_at } : {}),
            close_home_spread: r.home_spread,
            close_seen_at: seenAt,
          };
        }),
        { onConflict: 'event_id' }
      );
      if (!error) return rows.length;
      // close columns not added yet (sql/game_line_openers.sql ALTER) — openers only
      if (!/close_/.test(error.message)) {
        console.warn('[line openers]', error.message);
        return 0;
      }
    }
    const { error } = await db
      .from('game_line_openers')
      .upsert(rows, { onConflict: 'event_id', ignoreDuplicates: true });
    if (error) console.warn('[line openers]', error.message);
    return error ? 0 : rows.length;
  } catch (e) {
    console.warn('[line openers]', e);
    return 0;
  }
}

export interface LineOpener {
  homeSpread: number;
  capturedAt: string;
  closeHomeSpread: number | null; // last consensus seen before kickoff
}

/** Openers for a sport's games from yesterday on, keyed by Odds API event id. */
export async function loadLineOpeners(sport: string): Promise<Record<string, LineOpener>> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const query = (cols: string) =>
    sb().from('game_line_openers').select(cols).eq('sport_key', sport).gte('commence_time', since).limit(1000);
  let res = await query('event_id, home_spread, captured_at, close_home_spread');
  if (res.error) res = await query('event_id, home_spread, captured_at'); // before the close ALTER
  if (res.error) return {};
  const out: Record<string, LineOpener> = {};
  for (const r of (res.data ?? []) as unknown as Array<Record<string, unknown>>) {
    out[r.event_id as string] = {
      homeSpread: Number(r.home_spread),
      capturedAt: r.captured_at as string,
      closeHomeSpread: r.close_home_spread === null || r.close_home_spread === undefined ? null : Number(r.close_home_spread),
    };
  }
  return out;
}
