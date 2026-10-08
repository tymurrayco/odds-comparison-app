// src/lib/lineOpeners.ts
//
// Open/close capture for the odds table's Open (pre-game) and Close (after
// kickoff) columns, spreads and totals. The first time the app sees a
// football game with spreads posted, its consensus spread (same all-book
// average the Ledger chip compares against) and consensus total are stored in
// game_line_openers as the openers; every later pre-kickoff sighting
// overwrites the close_* columns, so the last line seen before kickoff is the
// close. Missing table/columns or write errors are swallowed — the odds route
// must never fail over this.

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

/** Consensus total across books (average Over point), or null. */
export function consensusTotal(game: OddsGame): number | null {
  const pts = (game.bookmakers ?? [])
    .map((b) => b.markets.find((m) => m.key === 'totals')?.outcomes.find((o) => o.name === 'Over')?.point)
    .filter((p): p is number => typeof p === 'number');
  return pts.length ? pts.reduce((a, b) => a + b, 0) / pts.length : null;
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
    const total = consensusTotal(g);
    rows.push({
      row: {
        event_id: g.id,
        sport_key: sport,
        home_team: g.home_team,
        away_team: g.away_team,
        commence_time: g.commence_time,
        home_spread: Math.round(spread * 100) / 100,
        books,
      },
      total: total === null ? null : Math.round(total * 100) / 100,
    });
  }
  if (!rows.length) return 0;
  try {
    const db = sb();
    // Keep existing openers; refresh the closes on every pre-kickoff sighting.
    // Tiers fall back while the ALTERs in sql/game_line_openers.sql are pending:
    // full (totals + closes) -> closes without totals -> openers only.
    const { data: existing, error: readErr } = await db
      .from('game_line_openers')
      .select('*')
      .in('event_id', rows.map((r) => r.row.event_id));
    if (!readErr) {
      const prev = new Map((existing ?? []).map((e) => [e.event_id as string, e as Record<string, unknown>]));
      const seenAt = new Date().toISOString();
      for (const withTotals of [true, false]) {
        const { error } = await db.from('game_line_openers').upsert(
          rows.map(({ row, total }) => {
            const p = prev.get(row.event_id);
            // Every row must carry captured_at: a bulk upsert sends one column
            // list, so a batch mixing known and new games would send NULL for
            // the new ones and the NOT NULL column rejects the whole batch
            // (NCAAF stopped gaining openers after the first few, 2026-10-04).
            return {
              ...row,
              captured_at: seenAt,
              ...(p ? { home_spread: p.home_spread, books: p.books, captured_at: p.captured_at } : {}),
              close_home_spread: row.home_spread,
              close_seen_at: seenAt,
              ...(withTotals
                ? { open_total: (p?.open_total as number | null | undefined) ?? total, close_total: total }
                : {}),
            };
          }),
          { onConflict: 'event_id' }
        );
        if (!error) return rows.length;
        if (withTotals && /_total/.test(error.message)) continue; // totals ALTER pending
        if (!/close_/.test(error.message)) {
          console.warn('[line openers]', error.message);
          return 0;
        }
        break; // close ALTER pending too
      }
    }
    const { error } = await db
      .from('game_line_openers')
      .upsert(rows.map((r) => r.row), { onConflict: 'event_id', ignoreDuplicates: true });
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
  openTotal: number | null;
  closeTotal: number | null;
}

/** Openers for a sport's games from yesterday on, keyed by Odds API event id. */
export async function loadLineOpeners(sport: string): Promise<Record<string, LineOpener>> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const query = (cols: string) =>
    sb().from('game_line_openers').select(cols).eq('sport_key', sport).gte('commence_time', since).limit(1000);
  let res = await query('event_id, home_spread, captured_at, close_home_spread, open_total, close_total');
  if (res.error) res = await query('event_id, home_spread, captured_at, close_home_spread'); // before the totals ALTER
  if (res.error) res = await query('event_id, home_spread, captured_at'); // before the close ALTER
  if (res.error) return {};
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const out: Record<string, LineOpener> = {};
  for (const r of (res.data ?? []) as unknown as Array<Record<string, unknown>>) {
    out[r.event_id as string] = {
      homeSpread: Number(r.home_spread),
      capturedAt: r.captured_at as string,
      closeHomeSpread: num(r.close_home_spread),
      openTotal: num(r.open_total),
      closeTotal: num(r.close_total),
    };
  }
  return out;
}
