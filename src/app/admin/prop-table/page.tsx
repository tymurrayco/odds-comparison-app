'use client';

// src/app/admin/prop-table/page.tsx
// Prop Table: board-wide value scan for one prop market. Every player with a
// posted line gets auto-priced with the STANDARD SETTINGS at the top
// (projection = measured mean of the latest season, volatility per setting,
// curve = shape-aware auto), then ranked best value first with incremental
// scroll to the worst. Rows deep-link into the Prop Pricer via its
// localStorage persistence key.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { probOver, probToAmerican, expectedValue, devig } from '@/lib/props/engine';
import { PROP_MARKETS, PROP_BOOKS, PropMarketDef, PlayerGameLog, Distribution } from '@/lib/props/markets';
import { measurePlayer } from '@/lib/props/reference';

const NFL_SPORTS = [
  { key: 'americanfootball_nfl', label: 'NFL' },
  { key: 'americanfootball_nfl_preseason', label: 'Preseason' },
];

const fieldCls =
  'px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0052ff]/25 focus:border-[#0052ff]';
const labelCls = 'block text-xs font-medium text-slate-500 mb-1';
const btnCls =
  'px-3 py-1.5 text-xs font-semibold rounded-full bg-[#0052ff] text-white hover:bg-[#0043d6] disabled:opacity-40 disabled:cursor-not-allowed transition';

const normName = (s: string): string =>
  s.toLowerCase().replace(/\./g, '').replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '').replace(/\s+/g, ' ').trim();

const fmtAmerican = (o: number | null | undefined): string =>
  o === null || o === undefined || Number.isNaN(o) ? '—' : o > 0 ? `+${o}` : `${o}`;

const evCls = (ev: number | null): string =>
  ev === null ? 'text-slate-400'
    : ev > 0.02 ? 'text-emerald-600 font-semibold'
    : ev > 0 ? 'text-emerald-500'
    : ev > -0.02 ? 'text-red-400'
    : 'text-red-600';

interface PlayerSearchResult {
  player_id: string; player_name: string; position: string; team: string; last_season: number;
}
interface RawOutcome { name?: string; description?: string; price?: number; point?: number }
interface RawMarket { key?: string; outcomes?: RawOutcome[] }
interface RawBookmaker { title?: string; markets?: RawMarket[] }
interface OddsEvent { id: string; away_team: string; home_team: string; commence_time: string; bookmakers?: RawBookmaker[] }

interface PropReferenceLite {
  markets?: Record<string, Record<string, {
    overall: { multiplier: number | null };
    tiers: { min: number; max: number | null; multiplier: number | null }[];
  }>>;
}

type SdSetting = 'measured' | 'tier' | 'league';

interface Row {
  key: string;
  playerName: string;
  match: PlayerSearchResult | null;
  games: number;
  projection: number | null;
  sd: number | null;
  dist: Distribution | null;
  line: number;
  pOver: number | null;
  fairOver: number | null;
  fairUnder: number | null;
  bestOver: { price: number; book: string } | null;
  bestUnder: { price: number; book: string } | null;
  marketPOver: number | null;
  evOver: number | null;
  evUnder: number | null;
  value: number | null;     // max EV across sides — the ranking key
  valueSide: 'Over' | 'Under' | null;
  note: string | null;      // why unpriced (no logs / thin history / no prices)
}

export default function PropTablePage() {
  const router = useRouter();
  const [sportKey, setSportKey] = useState(NFL_SPORTS[0].key);
  const [marketKey, setMarketKey] = useState('rec_yds');
  const [sdSetting, setSdSetting] = useState<SdSetting>('measured');
  const [minGames, setMinGames] = useState('6');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [visible, setVisible] = useState(30);
  const [apiRemaining, setApiRemaining] = useState<string | null>(null);

  const marketDef: PropMarketDef = useMemo(
    () => PROP_MARKETS.find((m) => m.key === marketKey) ?? PROP_MARKETS[0],
    [marketKey]
  );

  // Per-session caches: player-name -> search match, player_id -> game logs.
  const matchCache = useRef(new Map<string, PlayerSearchResult | null>());
  const logsCache = useRef(new Map<string, PlayerGameLog[]>());
  const referenceRef = useRef<PropReferenceLite | null>(null);

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => {
      if (es[0].isIntersecting) setVisible((v) => v + 30);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [rows.length]);

  const findPlayer = useCallback(async (name: string): Promise<PlayerSearchResult | null> => {
    const key = normName(name);
    if (matchCache.current.has(key)) return matchCache.current.get(key) ?? null;
    let match: PlayerSearchResult | null = null;
    try {
      let res = await fetch(`/api/nfl-props/players?q=${encodeURIComponent(name)}`);
      let players: PlayerSearchResult[] = (await res.json()).players ?? [];
      if (!players.length) {
        const surname = name.trim().split(/\s+/).pop() ?? '';
        if (surname.length >= 2) {
          res = await fetch(`/api/nfl-props/players?q=${encodeURIComponent(surname)}`);
          players = (await res.json()).players ?? [];
        }
      }
      // Exact normalized-name match only — a near-miss prices the wrong player.
      match = players.find((p) => normName(p.player_name) === key) ?? null;
    } catch { /* leave null */ }
    matchCache.current.set(key, match);
    return match;
  }, []);

  const getLogs = useCallback(async (playerId: string): Promise<PlayerGameLog[]> => {
    const hit = logsCache.current.get(playerId);
    if (hit) return hit;
    try {
      const res = await fetch(`/api/nfl-props/players?playerId=${encodeURIComponent(playerId)}`);
      const games: PlayerGameLog[] = (await res.json()).games ?? [];
      logsCache.current.set(playerId, games);
      return games;
    } catch {
      return [];
    }
  }, []);

  const loadBoard = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRows([]);
    setVisible(30);
    try {
      // Reference (tier/league multipliers) — once per session
      if (!referenceRef.current) {
        try {
          const r = await fetch('/api/nfl-props/reference');
          referenceRef.current = (await r.json()).reference ?? {};
        } catch { referenceRef.current = {}; }
      }

      setProgress('loading events…');
      const evRes = await fetch(`/api/props?sport=${sportKey}`);
      const evRem = evRes.headers.get('x-requests-remaining');
      if (evRem) setApiRemaining(evRem);
      const evJson = await evRes.json();
      if (!evRes.ok) throw new Error(evJson.details || evJson.error || `HTTP ${evRes.status}`);
      const events: OddsEvent[] = Array.isArray(evJson) ? evJson : [];
      if (!events.length) { setProgress(''); setError('No events available for this sport.'); return; }

      // Quotes per player across ALL events (main-line market only — alts cost extra)
      interface Q { side: 'over' | 'under'; price: number; point: number; book: string }
      const quotesByPlayer = new Map<string, Q[]>();
      const capped = events.slice(0, 20);
      for (let i = 0; i < capped.length; i++) {
        setProgress(`odds ${i + 1}/${capped.length}…`);
        try {
          const res = await fetch(`/api/props?sport=${sportKey}&eventId=${capped[i].id}&markets=${marketDef.oddsApiKey}`);
          const rem = res.headers.get('x-requests-remaining');
          if (rem) setApiRemaining(rem);
          if (!res.ok) continue;
          const data = await res.json();
          for (const bm of (data.bookmakers ?? []) as RawBookmaker[]) {
            if (!bm.title || !PROP_BOOKS.has(bm.title)) continue;
            for (const mkt of bm.markets ?? []) {
              if (mkt.key !== marketDef.oddsApiKey) continue;
              for (const oc of mkt.outcomes ?? []) {
                const side = oc.name?.toLowerCase();
                if ((side !== 'over' && side !== 'under') || !oc.description || oc.price === undefined || oc.point === undefined) continue;
                const list = quotesByPlayer.get(oc.description) ?? [];
                list.push({ side, price: oc.price, point: oc.point, book: bm.title ?? '?' });
                quotesByPlayer.set(oc.description, list);
              }
            }
          }
        } catch { /* skip event */ }
      }

      if (quotesByPlayer.size === 0) {
        setProgress('');
        setError('No posted lines for this market yet — books typically post props a few days before games.');
        return;
      }

      // Price every player with the standard settings
      const names = Array.from(quotesByPlayer.keys());
      const out: Row[] = [];
      const minG = Number(minGames) || 0;
      const ref = referenceRef.current;

      let done = 0;
      const pricePlayer = async (name: string): Promise<Row> => {
        const quotes = quotesByPlayer.get(name)!;
        // Consensus line: most common point among over quotes
        const counts = new Map<number, number>();
        for (const q of quotes) if (q.side === 'over') counts.set(q.point, (counts.get(q.point) ?? 0) + 1);
        const line = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0]
          ?? quotes[0].point;
        const overs = quotes.filter((q) => q.side === 'over' && q.point === line);
        const unders = quotes.filter((q) => q.side === 'under' && q.point === line);
        const bestOver = overs.length ? overs.reduce((a, b) => (b.price > a.price ? b : a)) : null;
        const bestUnder = unders.length ? unders.reduce((a, b) => (b.price > a.price ? b : a)) : null;
        const marketPOver = bestOver && bestUnder ? devig(bestOver.price, bestUnder.price).pOver : null;

        const base: Row = {
          key: name, playerName: name, match: null, games: 0,
          projection: null, sd: null, dist: null, line,
          pOver: null, fairOver: null, fairUnder: null,
          bestOver: bestOver ? { price: bestOver.price, book: bestOver.book } : null,
          bestUnder: bestUnder ? { price: bestUnder.price, book: bestUnder.book } : null,
          marketPOver, evOver: null, evUnder: null, value: null, valueSide: null, note: null,
        };

        const match = await findPlayer(name);
        if (!match) return { ...base, note: 'no game logs matched' };
        base.match = match;
        const games = await getLogs(match.player_id);
        if (!games.length) return { ...base, note: 'no game logs' };
        const latest = Math.max(...games.map((g) => g.season));
        const measured = measurePlayer(games, marketDef, { seasons: [latest] });
        if (!measured || measured.games < minG) {
          return { ...base, games: measured?.games ?? 0, note: `thin history (${measured?.games ?? 0} games)` };
        }
        base.games = measured.games;
        const proj = measured.mean;

        // Volatility per the standard setting, with graceful fallback
        const posRef = ref?.markets?.[marketDef.key]?.[match.position];
        const tierMult = posRef?.tiers.find((t) => proj >= t.min && (t.max === null || proj < t.max))?.multiplier ?? null;
        const leagueMult = posRef?.overall.multiplier ?? null;
        let sd: number | null = null;
        if (sdSetting === 'measured') sd = measured.sd || (tierMult !== null ? tierMult * proj : null);
        else if (sdSetting === 'tier') sd = tierMult !== null ? tierMult * proj : measured.sd;
        else sd = leagueMult !== null ? leagueMult * proj : measured.sd;
        if (!sd || sd <= 0) return { ...base, note: 'no volatility estimate' };

        // Shape-aware auto curve (same rule as the Pricer)
        const dist: Distribution = measured.games >= 8 && measured.median > 0
          ? ((measured.mean - measured.median) / measured.median > 0.05 ? 'lognormal' : 'normal')
          : marketDef.defaultDist;

        const pOver = probOver(proj, sd, line, dist);
        const evOver = bestOver ? expectedValue(pOver, bestOver.price) : null;
        const evUnder = bestUnder ? expectedValue(1 - pOver, bestUnder.price) : null;
        const value = evOver !== null || evUnder !== null
          ? Math.max(evOver ?? -Infinity, evUnder ?? -Infinity)
          : null;
        return {
          ...base,
          projection: proj, sd, dist, pOver,
          fairOver: probToAmerican(pOver), fairUnder: probToAmerican(1 - pOver),
          evOver, evUnder, value,
          valueSide: value === null ? null : (evOver ?? -Infinity) >= (evUnder ?? -Infinity) ? 'Over' : 'Under',
        };
      };

      // Small concurrency pool so 50 players don't hammer the logs API at once
      const POOL = 4;
      const queue = [...names];
      await Promise.all(Array.from({ length: POOL }, async () => {
        while (queue.length) {
          const name = queue.shift()!;
          out.push(await pricePlayer(name));
          done++;
          setProgress(`pricing ${done}/${names.length}…`);
        }
      }));

      // Priced rows ranked best-first; unpriced rows at the bottom
      out.sort((a, b) => {
        if (a.value === null && b.value === null) return a.playerName.localeCompare(b.playerName);
        if (a.value === null) return 1;
        if (b.value === null) return -1;
        return b.value - a.value;
      });
      setRows(out);
      setProgress('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load board');
      setProgress('');
    } finally {
      setLoading(false);
    }
  }, [sportKey, marketDef, sdSetting, minGames, findPlayer, getLogs]);

  // Open a row in the full Pricer: seed its persistence key, then navigate.
  const openInPricer = (row: Row) => {
    if (!row.match) return;
    try {
      const raw = localStorage.getItem('prop-pricer-v1');
      const prev = raw ? JSON.parse(raw) : {};
      localStorage.setItem('prop-pricer-v1', JSON.stringify({
        ...prev,
        sportKey, marketKey, player: row.match,
        projection: '', projectionEdited: false,
        lineInput: String(row.line),
        overPriceInput: row.bestOver ? String(row.bestOver.price) : '',
        underPriceInput: row.bestUnder ? String(row.bestUnder.price) : '',
        excludedGames: [],
      }));
    } catch { /* still navigate */ }
    router.push('/admin/props');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between gap-3 h-12">
            <div className="flex items-center gap-0.5 min-w-0">
              <button
                onClick={() => router.push('/admin/bets')}
                aria-label="Back"
                className="inline-flex items-center justify-center w-7 h-7 -ml-1.5 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition"
              >
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
              </button>
              <h1 className="text-base font-bold tracking-tight truncate">Prop Table</h1>
              {apiRemaining && (
                <span className="ml-2 text-[10px] text-slate-400 whitespace-nowrap">API {apiRemaining} left</span>
              )}
            </div>
            <button
              onClick={() => router.push('/admin/props')}
              className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition"
            >
              Pricer
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 space-y-4">
        {/* Standard settings */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className={labelCls}>League</label>
              <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                {NFL_SPORTS.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setSportKey(s.key)}
                    className={`px-3 py-2 text-xs font-medium transition ${
                      sportKey === s.key ? 'bg-[#0052ff] text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>Volatility</label>
              <select value={sdSetting} onChange={(e) => setSdSetting(e.target.value as SdSetting)} className={fieldCls}>
                <option value="measured">Measured (tier fallback)</option>
                <option value="tier">Tier</option>
                <option value="league">League</option>
              </select>
            </div>
            <div className="w-24">
              <label className={labelCls}>Min games</label>
              <input value={minGames} onChange={(e) => setMinGames(e.target.value)} inputMode="numeric" className={`${fieldCls} w-full`} />
            </div>
            <button onClick={loadBoard} disabled={loading} className={btnCls}>
              {loading ? (progress || 'Loading…') : 'Load Board'}
            </button>
          </div>
          <div>
            <div className="flex flex-wrap gap-1.5">
              {PROP_MARKETS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMarketKey(m.key)}
                  className={`px-2.5 py-1.5 text-xs rounded-full font-medium transition ${
                    marketKey === m.key ? 'bg-[#0052ff] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="mt-1.5 text-[11px] leading-snug text-slate-400">
              Standard pricing: projection = his latest-season average · curve auto from his shape ·
              consensus line = most-quoted point · EV vs the best book price each side. Rows ranked
              best value first; tap a row to open it in the Pricer.
            </div>
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">{error}</div>}

        {/* Board */}
        {rows.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 uppercase tracking-wide">
                    <th className="py-1.5 pr-2">#</th>
                    <th className="py-1.5 pr-3">Player</th>
                    <th className="py-1.5 pr-3 text-right">Line</th>
                    <th className="py-1.5 pr-3 text-right">Proj</th>
                    <th className="py-1.5 pr-3 text-right">P(Over)</th>
                    <th className="py-1.5 pr-3 text-right">Mkt P(Over)</th>
                    <th className="py-1.5 pr-3 text-right">Best Over</th>
                    <th className="py-1.5 pr-3 text-right">EV O</th>
                    <th className="py-1.5 pr-3 text-right">Best Under</th>
                    <th className="py-1.5 pr-3 text-right">EV U</th>
                    <th className="py-1.5 text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, visible).map((r, i) => (
                    <tr
                      key={r.key}
                      onClick={() => openInPricer(r)}
                      className={`border-t border-slate-100 ${r.match ? 'cursor-pointer hover:bg-slate-50' : 'opacity-50'}`}
                    >
                      <td className="py-1.5 pr-2 text-slate-400 tabular-nums">{i + 1}</td>
                      <td className="py-1.5 pr-3">
                        <span className="font-medium">{r.playerName}</span>
                        {r.match && (
                          <span className="ml-1.5 text-[10px] text-slate-400">
                            {r.match.position} · {r.match.team} · {r.games}g
                            {r.dist === 'lognormal' ? ' · B/B' : ''}
                          </span>
                        )}
                        {r.note && <span className="ml-1.5 text-[10px] text-amber-600">{r.note}</span>}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{r.line}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-slate-500">
                        {r.projection !== null ? r.projection.toFixed(1) : '—'}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">
                        {r.pOver !== null ? `${(r.pOver * 100).toFixed(0)}%` : '—'}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-slate-500">
                        {r.marketPOver !== null ? `${(r.marketPOver * 100).toFixed(0)}%` : '—'}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">
                        {r.bestOver ? fmtAmerican(r.bestOver.price) : '—'}
                        {r.bestOver && <span className="text-[10px] text-slate-400"> {r.bestOver.book}</span>}
                      </td>
                      <td className={`py-1.5 pr-3 text-right tabular-nums ${evCls(r.evOver)}`}>
                        {r.evOver !== null ? `${r.evOver > 0 ? '+' : ''}${(r.evOver * 100).toFixed(1)}%` : '—'}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">
                        {r.bestUnder ? fmtAmerican(r.bestUnder.price) : '—'}
                        {r.bestUnder && <span className="text-[10px] text-slate-400"> {r.bestUnder.book}</span>}
                      </td>
                      <td className={`py-1.5 pr-3 text-right tabular-nums ${evCls(r.evUnder)}`}>
                        {r.evUnder !== null ? `${r.evUnder > 0 ? '+' : ''}${(r.evUnder * 100).toFixed(1)}%` : '—'}
                      </td>
                      <td className="py-1.5 text-right">
                        {r.value !== null && r.valueSide ? (
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            r.value > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {r.valueSide} {r.value > 0 ? '+' : ''}{(r.value * 100).toFixed(1)}%
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {visible < rows.length && (
              <div ref={sentinel} className="py-3 text-center text-xs text-slate-400">
                loading more… ({visible}/{rows.length})
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
