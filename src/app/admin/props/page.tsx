'use client';

// src/app/admin/props/page.tsx
// Admin: NFL prop pricer — projection + measured distribution → P(over),
// devigged market fair, EV, and a full alt-line ladder. Methodology: mean ≠
// median (yardage props are right-skewed → lognormal at the main line).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  probOver, probToAmerican, americanToProb, devig, expectedValue,
  priceLadder, syntheticLines, median as medianOf, lognormalParams,
} from '@/lib/props/engine';
import { PROP_MARKETS, PROP_BOOKS, PropMarketDef, PlayerGameLog, Distribution } from '@/lib/props/markets';
import { PropReference, measurePlayer, MeasuredStats } from '@/lib/props/reference';
import DistributionChart from './DistributionChart';
import { useDebounce } from '@/app/ratings/hooks/useDebounce';

const MARKET_UNITS: { [key: string]: string } = {
  rush_yds: 'yds', rec_yds: 'yds', pass_yds: 'yds',
  rush_attempts: 'att', receptions: 'rec', pass_attempts: 'att', pass_completions: 'comp',
};

const NFL_SPORTS = [
  { key: 'americanfootball_nfl', label: 'NFL' },
  { key: 'americanfootball_nfl_preseason', label: 'Preseason' },
];

const fieldCls =
  'w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0052ff]/25 focus:border-[#0052ff]';
const labelCls = 'block text-xs font-medium text-slate-500 mb-1';
const cardCls = 'bg-white rounded-xl border border-slate-200 shadow-sm p-4';
const btnCls =
  'px-3 py-1.5 text-xs font-semibold rounded-full bg-[#0052ff] text-white hover:bg-[#0043d6] disabled:opacity-40 disabled:cursor-not-allowed transition';
const btnGhostCls =
  'px-3 py-1.5 text-xs font-medium rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-40 transition';

// ---------- types ----------

interface OddsEvent {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
}

interface Quote {
  book: string;
  side: 'over' | 'under';
  price: number;
  point: number;
}

interface PlayerSearchResult {
  player_id: string;
  player_name: string;
  position: string;
  team: string;
  last_season: number;
}

interface RawBookmaker {
  title: string;
  markets: {
    key: string;
    outcomes: { name: string; description?: string; price: number; point?: number }[];
  }[];
}

const fmtAmerican = (o: number | null | undefined): string =>
  o === null || o === undefined || Number.isNaN(o) ? '—' : o > 0 ? `+${o}` : `${o}`;

/** American odds are always <= -100 or >= +100; anything else is a typo
 *  (e.g. decimal odds pasted by habit) and must not reach the EV math. */
const parseAmerican = (s: string): number | null => {
  if (!s.trim()) return null;
  const n = Number(s);
  return Number.isFinite(n) && Math.abs(n) >= 100 ? n : null;
};

/** Loose name normalization so "A.J. Dillon" matches "AJ Dillon" and
 *  suffixes (Jr./Sr./III) don't break the odds→game-log join. */
const normName = (s: string): string =>
  s.toLowerCase().replace(/\./g, '').replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '').replace(/\s+/g, ' ').trim();

const fmtPct = (p: number | null | undefined, dp = 1): string =>
  p === null || p === undefined || Number.isNaN(p) ? '—' : `${(p * 100).toFixed(dp)}%`;

// ---- team theming (page tints to the selected player's team) ----
const normalizeTeamKey = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');
// nflverse team codes that differ from ESPN abbreviations
const TEAM_CODE_ALIASES: Record<string, string> = { LA: 'LAR', WAS: 'WSH', JAC: 'JAX' };
const hexToRgba = (hex: string, alpha: number): string => {
  const h = hex.replace('#', '').trim();
  if (h.length !== 6) return `rgba(0,0,0,${alpha})`;
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${alpha})`;
};
const luminance = (hex: string): number => {
  const h = hex.replace('#', '').trim();
  if (h.length !== 6) return 128;
  return 0.2126 * parseInt(h.slice(0, 2), 16) + 0.7152 * parseInt(h.slice(2, 4), 16) + 0.0722 * parseInt(h.slice(4, 6), 16);
};
// ESPN's "primary" is sometimes the near-black/navy of the pair (Broncos:
// dark navy primary, orange alternate) — as a 3px accent that reads as plain
// black. Prefer the alternate when the primary is very dark or very light
// and the alternate is more usable.
const pickAccent = (color?: string, alt?: string): string | null => {
  if (!color) return alt ?? null;
  const l = luminance(color);
  if ((l < 50 || l > 225) && alt) {
    const la = luminance(alt);
    if (la >= 50 && la <= 225) return alt;
  }
  return color;
};
interface TeamTheme { color: string; logo: string }

const evCls = (ev: number | null): string =>
  ev === null ? 'text-slate-400'
    : ev > 0.02 ? 'text-emerald-600 font-semibold'
    : ev > 0 ? 'text-emerald-500'
    : ev > -0.02 ? 'text-red-400'
    : 'text-red-600';

export default function PropsAdminPage() {
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Data panel
  const [showData, setShowData] = useState(false);
  const [syncCounts, setSyncCounts] = useState<{ season: number; rows: number }[]>([]);
  const [syncing, setSyncing] = useState<number | null>(null);
  const [reference, setReference] = useState<PropReference | null>(null);
  const [refComputing, setRefComputing] = useState(false);

  // Odds
  const [sportKey, setSportKey] = useState(NFL_SPORTS[0].key);
  const [events, setEvents] = useState<OddsEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventId, setEventId] = useState('');
  const [marketKey, setMarketKey] = useState('rush_yds');
  const [quotes, setQuotes] = useState<Map<string, Quote[]>>(new Map());
  const [oddsLoading, setOddsLoading] = useState(false);
  const [altLoaded, setAltLoaded] = useState(false);
  const [apiRemaining, setApiRemaining] = useState<string | null>(null);

  // Player
  const [oddsPlayer, setOddsPlayer] = useState('');
  const [playerSearch, setPlayerSearch] = useState('');
  const [playerResults, setPlayerResults] = useState<PlayerSearchResult[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerSearchResult | null>(null);
  const [playerGames, setPlayerGames] = useState<PlayerGameLog[]>([]);
  const [gamesLoading, setGamesLoading] = useState(false);

  // Measurement window
  const [seasonsSelected, setSeasonsSelected] = useState<number[]>([]);
  const [includePost, setIncludePost] = useState(false);
  const [minOpp, setMinOpp] = useState('0');
  const [excludeZero, setExcludeZero] = useState(false);
  // Per-game manual excludes (uncheck a row in the game log) + log visibility
  const [excludedGames, setExcludedGames] = useState<Set<string>>(new Set());
  const [showGameLog, setShowGameLog] = useState(false);

  // Team theme: page tints to the selected player's team colors. The NFL
  // team map (ESPN colors/logos) is fetched once and cached for the session.
  const [teamTheme, setTeamTheme] = useState<TeamTheme | null>(null);
  const teamMapRef = useRef<Record<string, { color: string; logo: string }> | null>(null);
  useEffect(() => {
    if (!selectedPlayer?.team) { setTeamTheme(null); return; }
    let cancelled = false;
    (async () => {
      try {
        if (!teamMapRef.current) {
          const resp = await fetch('/api/bet-team-logos?league=NFL');
          if (!resp.ok) return;
          teamMapRef.current = (await resp.json()).teams ?? {};
        }
        const code = selectedPlayer.team.toUpperCase();
        const info = teamMapRef.current?.[normalizeTeamKey(TEAM_CODE_ALIASES[code] ?? code)] as
          ({ color: string; logo: string; alternateColor?: string } | undefined);
        const accent = pickAccent(info?.color, info?.alternateColor);
        if (!cancelled) setTeamTheme(accent ? { color: accent, logo: info?.logo ?? '' } : null);
      } catch { /* theming is cosmetic — never block */ }
    })();
    return () => { cancelled = true; };
  }, [selectedPlayer]);

  const themedCard = teamTheme
    ? { borderTop: `3px solid #${teamTheme.color}` }
    : undefined;

  // × on the player badge: clear the player and everything derived from him.
  const clearPlayer = () => {
    setSelectedPlayer(null);
    setPlayerGames([]);
    setExcludedGames(new Set());
    setSeasonsSelected([]);
    setProjection('');
    setProjectionEdited(false);
    setPlayerSearch('');
  };

  // Pricing inputs
  const [projection, setProjection] = useState('');
  const [projectionEdited, setProjectionEdited] = useState(false); // user typed → stop defaulting
  const [sdMode, setSdMode] = useState<'measured' | 'league' | 'tier' | 'custom'>('measured');
  const [sdCustom, setSdCustom] = useState('');
  const [distMode, setDistMode] = useState<'auto' | Distribution>('auto');
  const [lineInput, setLineInput] = useState('');
  const [overPriceInput, setOverPriceInput] = useState('');
  const [underPriceInput, setUnderPriceInput] = useState('');

  const marketDef: PropMarketDef = useMemo(
    () => PROP_MARKETS.find((m) => m.key === marketKey) ?? PROP_MARKETS[0],
    [marketKey]
  );

  // Player-first flow: the markets that apply to the selected player's
  // position (all markets when nobody is selected). Game logs carry every
  // stat, so toggling markets is instant — no refetch.
  const availableMarkets = useMemo(
    () => (selectedPlayer
      ? PROP_MARKETS.filter((m) => m.positions.includes(selectedPlayer.position))
      : PROP_MARKETS),
    [selectedPlayer]
  );

  // If the current market doesn't exist for the player's position, hop to
  // the first one that does (no-op when the market is already valid, so a
  // restored session keeps its market).
  useEffect(() => {
    if (!selectedPlayer) return;
    const ok = PROP_MARKETS.some((m) => m.key === marketKey && m.positions.includes(selectedPlayer.position));
    if (!ok && availableMarkets.length) setMarketKey(availableMarkets[0].key);
  }, [selectedPlayer, marketKey, availableMarkets]);

  // ---------- data panel ----------

  const loadSyncCounts = useCallback(async () => {
    try {
      const res = await fetch('/api/nfl-props/sync');
      const json = await res.json();
      if (res.ok) setSyncCounts(json.seasons ?? []);
    } catch { /* non-blocking */ }
  }, []);

  const loadReference = useCallback(async () => {
    try {
      const res = await fetch('/api/nfl-props/reference');
      const json = await res.json();
      if (res.ok) setReference(json.reference);
    } catch { /* non-blocking */ }
  }, []);

  useEffect(() => {
    loadSyncCounts();
    loadReference();
  }, [loadSyncCounts, loadReference]);

  const handleSync = async (season: number) => {
    setSyncing(season);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/nfl-props/sync?season=${season}`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setMessage(`Synced ${season}: ${json.rows} game rows`);
      await loadSyncCounts();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(null);
    }
  };

  const handleRecomputeReference = async () => {
    setRefComputing(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/nfl-props/reference', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setReference(json.reference);
      setMessage(`Reference recomputed from ${json.gameRows} game rows`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Recompute failed');
    } finally {
      setRefComputing(false);
    }
  };

  // ---------- odds ----------

  const loadEvents = useCallback(async (sport: string) => {
    setEventsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/props?sport=${sport}`);
      // The free events call carries the quota header too — surface the
      // "API N left" readout on page open, not only after a paid Load Odds.
      const rem = res.headers.get('x-requests-remaining');
      if (rem) setApiRemaining(rem);
      const json = await res.json();
      // /api/props error shape: { error, details } with details at top level
      if (!res.ok) throw new Error(json.details || json.error || `HTTP ${res.status}`);
      setEvents(Array.isArray(json) ? json : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load events');
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }, []);

  // Quotes/line/prices are all derived from one (event, market, player)
  // selection — any change to that tuple must drop the stale odds state.
  const resetOddsSelection = useCallback(() => {
    setQuotes(new Map());
    setAltLoaded(false);
    setOddsPlayer('');
    setLineInput('');
    setOverPriceInput('');
    setUnderPriceInput('');
  }, []);

  useEffect(() => {
    loadEvents(sportKey);
    setEventId('');
    resetOddsSelection();
  }, [sportKey, loadEvents, resetOddsSelection]);

  // Switching games invalidates the previous game's quotes
  useEffect(() => {
    resetOddsSelection();
  }, [eventId, resetOddsSelection]);

  const extractQuotes = (bookmakers: RawBookmaker[]): Map<string, Quote[]> => {
    const map = new Map<string, Quote[]>();
    for (const bm of bookmakers ?? []) {
      if (!PROP_BOOKS.has(bm.title)) continue;
      for (const mkt of bm.markets ?? []) {
        if (mkt.key !== marketDef.oddsApiKey && mkt.key !== marketDef.oddsApiAltKey) continue;
        for (const oc of mkt.outcomes ?? []) {
          const playerName = oc.description;
          const side = oc.name?.toLowerCase();
          if (!playerName || (side !== 'over' && side !== 'under') || typeof oc.point !== 'number') continue;
          const arr = map.get(playerName) ?? [];
          arr.push({ book: bm.title, side, price: oc.price, point: oc.point });
          map.set(playerName, arr);
        }
      }
    }
    return map;
  };

  const loadOdds = async (withAlts: boolean) => {
    if (!eventId) return;
    setOddsLoading(true);
    setError(null);
    try {
      const markets = withAlts && marketDef.oddsApiAltKey
        ? `${marketDef.oddsApiKey},${marketDef.oddsApiAltKey}`
        : marketDef.oddsApiKey;
      const res = await fetch(`/api/props?sport=${sportKey}&eventId=${eventId}&markets=${markets}`);
      const remaining = res.headers.get('x-requests-remaining');
      if (remaining) setApiRemaining(remaining);
      const json = await res.json();
      if (!res.ok) throw new Error(json.details || json.error || `HTTP ${res.status}`);
      const map = extractQuotes(json.bookmakers ?? []);
      setQuotes(map);
      setAltLoaded(withAlts);
      if (!map.size) setMessage('No quotes posted for this market yet');
      else if (oddsPlayer && !map.has(oddsPlayer)) setOddsPlayer('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load odds');
    } finally {
      setOddsLoading(false);
    }
  };

  // Reset odds state when the market changes (quotes are per-market); the
  // projection default also re-applies for the new market's stat.
  useEffect(() => {
    resetOddsSelection();
    setProjectionEdited(false);
  }, [marketKey, resetOddsSelection]);

  // ---------- refresh persistence ----------
  // Selections and inputs survive a page refresh via localStorage. Quotes and
  // event lists are NOT persisted (they go stale and re-fetching burns Odds
  // API credits) — the player, market, measurement window, and every Price It
  // input come back; reload odds manually when needed.
  interface SavedPricerState {
    sportKey?: string;
    marketKey?: string;
    player?: PlayerSearchResult | null;
    seasonsSelected?: number[];
    includePost?: boolean;
    minOpp?: string;
    excludeZero?: boolean;
    excludedGames?: string[];
    projection?: string;
    projectionEdited?: boolean;
    sdMode?: 'measured' | 'league' | 'tier' | 'custom';
    sdCustom?: string;
    distMode?: 'auto' | Distribution;
    lineInput?: string;
    overPriceInput?: string;
    underPriceInput?: string;
  }
  const PERSIST_KEY = 'prop-pricer-v1';
  const pendingRestoreRef = useRef<SavedPricerState | null>(null);
  const hydratedRef = useRef(false);

  // Phase 1 (mount): read saved state, set the selection tuple, and start the
  // player-log fetch. The input fields are NOT applied here — the sport/market
  // reset effects above fire when those keys change and would clobber them.
  useEffect(() => {
    let saved: SavedPricerState | null = null;
    try {
      const raw = localStorage.getItem(PERSIST_KEY);
      if (raw) saved = JSON.parse(raw) as SavedPricerState;
    } catch { /* corrupted state — start fresh */ }
    if (!saved || (!saved.player && !saved.marketKey)) {
      hydratedRef.current = true;
      return;
    }
    pendingRestoreRef.current = saved;
    if (saved.sportKey) setSportKey(saved.sportKey);
    if (saved.marketKey) setMarketKey(saved.marketKey);
    const p = saved.player;
    const savedSeasons = saved.seasonsSelected;
    if (p) {
      setSelectedPlayer(p);
      setGamesLoading(true);
      (async () => {
        try {
          const res = await fetch(`/api/nfl-props/players?playerId=${encodeURIComponent(p.player_id)}`);
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
          const games: PlayerGameLog[] = json.games ?? [];
          setPlayerGames(games);
          const seasons = Array.from(new Set(games.map((g) => g.season))).sort((a, b) => b - a);
          setSeasonsSelected(savedSeasons?.length ? savedSeasons : seasons.slice(0, 1));
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Failed to restore game logs');
        } finally {
          setGamesLoading(false);
        }
      })();
    }
  }, []);

  // Phase 2: once the restored sport/market keys have committed (so their
  // reset effects, declared ABOVE, have already fired this commit), re-apply
  // the inputs. Declaration order after those effects makes this deterministic.
  useEffect(() => {
    const s = pendingRestoreRef.current;
    if (!s) return;
    if (s.marketKey && marketKey !== s.marketKey) return; // not committed yet
    if (s.sportKey && sportKey !== s.sportKey) return;
    pendingRestoreRef.current = null;
    if (s.includePost !== undefined) setIncludePost(s.includePost);
    if (s.minOpp !== undefined) setMinOpp(s.minOpp);
    if (s.excludeZero !== undefined) setExcludeZero(s.excludeZero);
    if (s.excludedGames?.length) setExcludedGames(new Set(s.excludedGames));
    if (s.sdMode) setSdMode(s.sdMode);
    if (s.sdCustom !== undefined) setSdCustom(s.sdCustom);
    if (s.distMode) setDistMode(s.distMode);
    if (s.lineInput !== undefined) setLineInput(s.lineInput);
    if (s.overPriceInput !== undefined) setOverPriceInput(s.overPriceInput);
    if (s.underPriceInput !== undefined) setUnderPriceInput(s.underPriceInput);
    if (s.projectionEdited && s.projection) {
      setProjection(s.projection);
      setProjectionEdited(true); // hand-typed projection survives; defaults re-derive otherwise
    }
    hydratedRef.current = true;
  }, [marketKey, sportKey]);

  // Save on every change once hydration is done (so the initial empty render
  // never overwrites a saved session).
  useEffect(() => {
    if (!hydratedRef.current) return;
    try {
      localStorage.setItem(PERSIST_KEY, JSON.stringify({
        sportKey, marketKey, player: selectedPlayer,
        seasonsSelected, includePost, minOpp, excludeZero,
        excludedGames: Array.from(excludedGames),
        projection, projectionEdited, sdMode, sdCustom, distMode,
        lineInput, overPriceInput, underPriceInput,
      } satisfies SavedPricerState));
    } catch { /* storage full/blocked — non-blocking */ }
  }, [sportKey, marketKey, selectedPlayer, seasonsSelected, includePost, minOpp, excludeZero,
      excludedGames, projection, projectionEdited, sdMode, sdCustom, distMode,
      lineInput, overPriceInput, underPriceInput]);

  // ---------- player logs ----------

  const searchPlayers = useCallback(async (q: string): Promise<PlayerSearchResult[]> => {
    const res = await fetch(`/api/nfl-props/players?q=${encodeURIComponent(q)}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json.players ?? [];
  }, []);

  const selectPlayer = useCallback(async (p: PlayerSearchResult) => {
    setSelectedPlayer(p);
    setGamesLoading(true);
    setPlayerGames([]);
    setExcludedGames(new Set()); // manual excludes are per-player
    setProjectionEdited(false); // new player → fresh measured-mean default
    try {
      const res = await fetch(`/api/nfl-props/players?playerId=${encodeURIComponent(p.player_id)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      const games: PlayerGameLog[] = json.games ?? [];
      setPlayerGames(games);
      const seasons = Array.from(new Set(games.map((g) => g.season))).sort((a, b) => b - a);
      setSeasonsSelected(seasons.slice(0, 1)); // default: most recent season
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load game logs');
    } finally {
      setGamesLoading(false);
    }
  }, []);

  // Picking a player from the odds list auto-matches game logs by name.
  // Only a (normalized) exact name match auto-attaches — a near-miss must be
  // resolved by hand, or the whole page silently prices the wrong player.
  const pickOddsPlayer = async (name: string) => {
    setOddsPlayer(name);
    setLineInput('');
    setOverPriceInput('');
    setUnderPriceInput('');
    if (!name) return;
    setError(null);
    try {
      let results = await searchPlayers(name);
      if (!results.length) {
        // Full string missed (punctuation/suffix differences) — retry surname
        const surname = name.trim().split(/\s+/).pop() ?? '';
        if (surname.length >= 2) results = await searchPlayers(surname);
      }
      const exact = results.find((r) => normName(r.player_name) === normName(name));
      setPlayerResults(results);
      if (exact) {
        await selectPlayer(exact);
      } else {
        setSelectedPlayer(null);
        setPlayerGames([]);
        if (results.length) {
          setPlayerSearch(name);
          setMessage(`No exact game-log match for "${name}" — pick the right player from the search list`);
        } else {
          setMessage(`No game logs found for "${name}" — sync seasons or search manually`);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Player lookup failed');
    }
  };

  // Manual search: shared debounce hook + cancellation so a slow earlier
  // response can't land after a newer one and show stale results
  const debouncedPlayerSearch = useDebounce(playerSearch, 300);
  useEffect(() => {
    const q = debouncedPlayerSearch.trim();
    if (q.length < 2) { setPlayerResults([]); return; }
    let cancelled = false;
    searchPlayers(q)
      .then((r) => { if (!cancelled) setPlayerResults(r); })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [debouncedPlayerSearch, searchPlayers]);

  // ---------- measured stats ----------

  const availableSeasons = useMemo(
    () => Array.from(new Set(playerGames.map((g) => g.season))).sort((a, b) => b - a),
    [playerGames]
  );

  // One key per game row so manual excludes survive re-renders and persist.
  const gameKey = (g: PlayerGameLog): string => `${g.season}-${g.season_type}-${g.week}`;

  const measured: MeasuredStats | null = useMemo(() => {
    if (!playerGames.length || !seasonsSelected.length) return null;
    const kept = playerGames.filter((g) => !excludedGames.has(gameKey(g)));
    return measurePlayer(kept, marketDef, {
      seasons: seasonsSelected,
      includePost,
      minOpportunities: Number(minOpp) || 0,
      excludeZero,
    });
  }, [playerGames, seasonsSelected, includePost, minOpp, excludeZero, excludedGames, marketDef]);

  // Default projection follows measured mean until the user edits it
  // (projectionEdited flips on typing; clearing the box re-enables the default)
  useEffect(() => {
    if (measured && !projectionEdited) setProjection(measured.mean.toFixed(1));
  }, [measured, projectionEdited]);

  // ---------- market quotes for selected player ----------

  const playerQuotes: Quote[] = useMemo(
    () => (oddsPlayer ? quotes.get(oddsPlayer) ?? [] : []),
    [quotes, oddsPlayer]
  );

  const bookLines = useMemo(
    () => Array.from(new Set(playerQuotes.map((q) => q.point))).sort((a, b) => a - b),
    [playerQuotes]
  );

  // Consensus main line = most common point among over quotes
  const consensusLine = useMemo(() => {
    const counts = new Map<number, number>();
    for (const q of playerQuotes) if (q.side === 'over') counts.set(q.point, (counts.get(q.point) ?? 0) + 1);
    let best: number | null = null;
    let bestN = 0;
    for (const [pt, n] of counts) if (n > bestN) { best = pt; bestN = n; }
    return best;
  }, [playerQuotes]);

  useEffect(() => {
    if (consensusLine !== null) setLineInput(String(consensusLine));
  }, [consensusLine]);

  const line = Number(lineInput);
  const hasLine = Number.isFinite(line) && lineInput !== '';

  const bestAt = useCallback((pt: number, side: 'over' | 'under'): Quote | null => {
    let best: Quote | null = null;
    for (const q of playerQuotes) {
      if (q.point !== pt || q.side !== side) continue;
      if (!best || q.price > best.price) best = q;
    }
    return best;
  }, [playerQuotes]);

  // Auto-fill prices from the best book at the chosen line (editable after).
  // Both sides are set unconditionally — an unquoted side must CLEAR, or the
  // previous line's price silently prices the new line. Skipped entirely in
  // manual mode (no quotes) so typed prices survive line edits.
  useEffect(() => {
    if (!hasLine || !playerQuotes.length) return;
    const over = bestAt(line, 'over');
    const under = bestAt(line, 'under');
    setOverPriceInput(over ? String(over.price) : '');
    setUnderPriceInput(under ? String(under.price) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line, playerQuotes]);

  // Market fair probability: devig each book quoting both sides at the line, take the median
  const marketFair = useMemo(() => {
    if (!hasLine) return null;
    const byBook = new Map<string, { over?: number; under?: number }>();
    for (const q of playerQuotes) {
      if (q.point !== line) continue;
      const b = byBook.get(q.book) ?? {};
      b[q.side] = q.price;
      byBook.set(q.book, b);
    }
    const fairs: number[] = [];
    const rounds: number[] = [];
    for (const b of byBook.values()) {
      if (b.over !== undefined && b.under !== undefined) {
        const d = devig(b.over, b.under);
        fairs.push(d.pOver);
        rounds.push(d.overround);
      }
    }
    if (!fairs.length) {
      // Manual fallback: devig the typed prices
      const o = parseAmerican(overPriceInput);
      const u = parseAmerican(underPriceInput);
      if (o !== null && u !== null) {
        const d = devig(o, u);
        return { pOver: d.pOver, overround: d.overround, books: 0 };
      }
      return null;
    }
    return { pOver: medianOf(fairs), overround: medianOf(rounds), books: fairs.length };
  }, [playerQuotes, line, hasLine, overPriceInput, underPriceInput]);

  // ---------- pricing ----------

  const projNum = Number(projection);
  const hasProj = Number.isFinite(projNum) && projNum > 0;

  const position = selectedPlayer?.position ?? marketDef.positions[0];
  const posRef = reference?.markets?.[marketDef.key]?.[position] ?? null;
  const leagueMult = posRef?.overall.multiplier ?? null;
  const tierMult = useMemo(() => {
    if (!posRef || !hasProj) return null;
    const t = posRef.tiers.find((t) => projNum >= t.min && (t.max === null || projNum < t.max));
    return t?.multiplier ?? null;
  }, [posRef, hasProj, projNum]);

  const sd = useMemo(() => {
    if (sdMode === 'measured') return measured?.sd ?? null;
    if (sdMode === 'league') return leagueMult !== null && hasProj ? leagueMult * projNum : null;
    if (sdMode === 'tier') return tierMult !== null && hasProj ? tierMult * projNum : null;
    const c = Number(sdCustom);
    return Number.isFinite(c) && c > 0 ? c : null;
  }, [sdMode, measured, leagueMult, tierMult, hasProj, projNum, sdCustom]);

  // Auto distribution now reads the PLAYER'S measured shape, not just the
  // stat type: mean meaningfully above median (>5%) = boom/bust pattern ->
  // lognormal; otherwise (steady or dud-dragged) -> normal. Falls back to
  // the market default until the sample is big enough (8+ games) for the
  // mean/median comparison to be trustworthy.
  const autoDist: { dist: Distribution; basis: 'shape' | 'default' } = useMemo(() => {
    if (measured && measured.games >= 8 && measured.median > 0) {
      const rel = (measured.mean - measured.median) / measured.median;
      return { dist: rel > 0.05 ? 'lognormal' : 'normal', basis: 'shape' };
    }
    return { dist: marketDef.defaultDist, basis: 'default' };
  }, [measured, marketDef]);

  const dist: Distribution = distMode === 'auto' ? autoDist.dist : distMode;

  const overPrice = parseAmerican(overPriceInput);
  const underPrice = parseAmerican(underPriceInput);

  const result = useMemo(() => {
    if (!hasProj || !sd || !hasLine) return null;
    const pNormal = probOver(projNum, sd, line, 'normal');
    const pLog = probOver(projNum, sd, line, 'lognormal');
    const p = dist === 'normal' ? pNormal : pLog;
    const be = overPrice !== null ? americanToProb(overPrice) : null;
    return {
      pNormal,
      pLog,
      p,
      fair: probToAmerican(p),
      fairUnder: probToAmerican(1 - p),
      breakeven: be,
      edge: be !== null ? p - be : null,
      ev: overPrice !== null ? expectedValue(p, overPrice) : null,
      evUnder: underPrice !== null ? expectedValue(1 - p, underPrice) : null,
    };
  }, [hasProj, projNum, sd, hasLine, line, dist, overPrice, underPrice]);

  const ladder = useMemo(() => {
    if (!hasProj || !sd) return [];
    const lines = bookLines.length > 1 ? bookLines : syntheticLines(projNum, marketDef.ladderStep);
    const book = new Map<number, { over: number | null; under: number | null }>();
    for (const pt of lines) {
      book.set(pt, { over: bestAt(pt, 'over')?.price ?? null, under: bestAt(pt, 'under')?.price ?? null });
    }
    return priceLadder(projNum, sd, dist, lines, book);
  }, [hasProj, projNum, sd, dist, bookLines, marketDef.ladderStep, bestAt]);

  const oddsPlayers = useMemo(() => Array.from(quotes.keys()).sort(), [quotes]);

  // ---------- render ----------

  return (
    <div
      className="min-h-screen bg-slate-50 text-slate-900"
      style={teamTheme ? {
        backgroundImage: `linear-gradient(180deg, ${hexToRgba(teamTheme.color, 0.08)} 0%, rgba(248,250,252,0) 260px)`,
      } : undefined}
    >
      {/* Header */}
      <div
        className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-slate-200"
        style={teamTheme ? { borderBottom: `2px solid #${teamTheme.color}` } : undefined}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between gap-3 h-12">
            <div className="flex items-center gap-0.5 min-w-0">
              <button
                onClick={() => router.push('/')}
                aria-label="Back"
                className="inline-flex items-center justify-center w-7 h-7 -ml-1.5 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition"
              >
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
              </button>
              <h1 className="text-base font-bold tracking-tight truncate">Prop Pricer</h1>
              {apiRemaining && (
                <span className="ml-2 text-[10px] text-slate-400 whitespace-nowrap">API {apiRemaining} left</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push('/admin/prop-table')}
                className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition"
              >
                Table
              </button>
              <button onClick={() => setShowData(!showData)} className={btnGhostCls}>
                {showData ? 'Hide Data' : 'Data'}
              </button>
              <button onClick={() => router.push('/admin/power-ratings')} className={btnGhostCls}>
                Power Ratings
              </button>
              <button onClick={() => router.push('/admin/bets')} className={`${btnGhostCls} hidden sm:inline-flex`}>
                Bet Admin
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
        {message && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">{message}</div>}

        {/* Data panel */}
        {showData && (
          <div className={`${cardCls} space-y-4`}>
            <div>
              <div className="text-sm font-semibold mb-2">Game Logs (nflverse weekly stats)</div>
              <div className="flex flex-wrap gap-2">
                {[2022, 2023, 2024, 2025, 2026].map((season) => {
                  const count = syncCounts.find((s) => s.season === season)?.rows;
                  return (
                    <button
                      key={season}
                      onClick={() => handleSync(season)}
                      disabled={syncing !== null}
                      className={`${btnGhostCls} flex items-center gap-1.5`}
                    >
                      {syncing === season ? 'Syncing…' : `Sync ${season}`}
                      {count !== undefined && (
                        <span className="text-[10px] text-slate-400">{count.toLocaleString()}</span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="text-xs text-slate-400 mt-1.5">
                Run each season once; re-run the current season weekly during the year. Requires the sql/nfl_props.sql tables.
              </div>
            </div>

            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="text-sm font-semibold">SD Multiplier Reference</div>
                <button onClick={handleRecomputeReference} disabled={refComputing} className={btnCls}>
                  {refComputing ? 'Computing…' : 'Recompute'}
                </button>
                {reference && (
                  <span className="text-xs text-slate-400">
                    seasons {reference.seasons.join(', ')} · {new Date(reference.computedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              {reference ? (
                <div className="overflow-x-auto">
                  <table className="text-xs w-full">
                    <thead>
                      <tr className="text-left text-slate-500 uppercase tracking-wide">
                        <th className="py-1 pr-3">Market</th>
                        <th className="py-1 pr-3">Pos</th>
                        <th className="py-1 pr-3 text-right">Multiplier</th>
                        <th className="py-1 pr-3 text-right">n</th>
                        <th className="py-1 pr-3">Tiers (per-game mean)</th>
                        <th className="py-1 text-right">Mean&gt;Median</th>
                      </tr>
                    </thead>
                    <tbody>
                      {PROP_MARKETS.flatMap((m) =>
                        m.positions.map((pos) => {
                          const r = reference.markets[m.key]?.[pos];
                          if (!r) return null;
                          return (
                            <tr key={`${m.key}-${pos}`} className="border-t border-slate-100">
                              <td className="py-1 pr-3">{m.label}</td>
                              <td className="py-1 pr-3">{pos}</td>
                              <td className="py-1 pr-3 text-right tabular-nums font-semibold">
                                {r.overall.multiplier ?? '—'}
                              </td>
                              <td className="py-1 pr-3 text-right tabular-nums text-slate-400">{r.overall.n}</td>
                              <td className="py-1 pr-3 text-slate-500">
                                {r.tiers.map((t) => `${t.label}: ${t.multiplier ?? '—'} (${t.n})`).join(' · ')}
                              </td>
                              <td className="py-1 text-right tabular-nums text-slate-500">
                                {r.meanAboveMedianPct !== null ? `${r.meanAboveMedianPct}%` : '—'}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-xs text-slate-400">No reference yet — sync seasons, then Recompute.</div>
              )}
            </div>
          </div>
        )}

        {/* Player-first selection: pick the player, toggle through his
            markets (instant — logs carry every stat), then optionally attach
            book quotes below. */}
        <div className={`${cardCls} space-y-3`} style={themedCard}>
          <div>
            <label className={labelCls}>Player</label>
            {selectedPlayer ? (
              /* Compact team-themed badge replaces the search bar; × clears
                 the player and brings the search back. */
              <div
                className="inline-flex items-center gap-2 text-sm pl-3 pr-1.5 py-1.5 rounded-full bg-slate-100"
                style={teamTheme ? {
                  background: hexToRgba(teamTheme.color, 0.1),
                  border: `1px solid ${hexToRgba(teamTheme.color, 0.35)}`,
                } : undefined}
              >
                {teamTheme?.logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={teamTheme.logo} alt="" className="h-5 w-5 object-contain" />
                )}
                <span className="font-semibold">{selectedPlayer.player_name}</span>
                <span className="text-slate-500 text-xs">{selectedPlayer.position} · {selectedPlayer.team}</span>
                <button
                  onClick={clearPlayer}
                  aria-label="Clear player"
                  className="ml-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full text-slate-400 hover:bg-white/70 hover:text-slate-700 transition"
                >
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>
            ) : (
              <div className="max-w-sm relative">
                <input
                  value={playerSearch}
                  onChange={(e) => setPlayerSearch(e.target.value)}
                  placeholder="Josh Jacobs…"
                  className={fieldCls}
                />
                {playerSearch.trim().length >= 2 && playerResults.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-auto">
                    {playerResults.map((p) => (
                      <button
                        key={p.player_id}
                        onClick={() => { selectPlayer(p); setPlayerSearch(''); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex justify-between"
                      >
                        <span>{p.player_name}</span>
                        <span className="text-xs text-slate-400">{p.position} · {p.team} · {p.last_season}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className={labelCls}>
              Market{selectedPlayer ? ` — ${selectedPlayer.position} (${availableMarkets.length})` : ''}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {availableMarkets.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMarketKey(m.key)}
                  className={`px-2.5 py-1.5 text-xs rounded-full font-medium transition ${
                    marketKey === m.key
                      ? 'bg-[#0052ff] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-slate-100">
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
            <div className="flex-1 min-w-[220px]">
              <label className={labelCls}>Game {eventsLoading && '(loading…)'}</label>
              <select value={eventId} onChange={(e) => setEventId(e.target.value)} className={fieldCls}>
                <option value="">Select game…</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.away_team} @ {ev.home_team} —{' '}
                    {new Date(ev.commence_time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </option>
                ))}
              </select>
            </div>
            <button onClick={() => loadOdds(false)} disabled={!eventId || oddsLoading} className={btnCls}>
              {oddsLoading ? 'Loading…' : 'Load Odds'}
            </button>
            {marketDef.oddsApiAltKey && (
              <button
                onClick={() => loadOdds(true)}
                disabled={!eventId || oddsLoading || altLoaded}
                className={btnGhostCls}
                title="Also fetch alternate lines (extra Odds API cost)"
              >
                {altLoaded ? 'Alts Loaded' : '+ Alt Lines'}
              </button>
            )}
            {oddsPlayers.length > 0 && (
              <div className="flex-1 min-w-[200px]">
                <label className={labelCls}>Match odds player ({oddsPlayers.length})</label>
                <select value={oddsPlayer} onChange={(e) => pickOddsPlayer(e.target.value)} className={fieldCls}>
                  <option value="">Select player…</option>
                  {oddsPlayers.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Measured distribution */}
        {selectedPlayer && (
          <div className={`${cardCls} space-y-3`} style={themedCard}>
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-sm font-semibold">Measured — {marketDef.label}</div>
              {gamesLoading && <span className="text-xs text-slate-400">loading game logs…</span>}
              <div className="flex gap-1.5">
                {availableSeasons.map((s) => (
                  <button
                    key={s}
                    onClick={() =>
                      setSeasonsSelected((prev) =>
                        prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
                      )
                    }
                    className={`px-2.5 py-1 text-xs rounded-full font-medium transition ${
                      seasonsSelected.includes(s)
                        ? 'bg-[#0052ff] text-white'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input type="checkbox" checked={includePost} onChange={(e) => setIncludePost(e.target.checked)} />
                Include playoffs
              </label>
              <label
                className="flex items-center gap-1.5 text-xs text-slate-600"
                title="Drops games where this stat was 0. Careful: a 0 on real playing time is a legitimate outcome — removing it inflates every Over. Prefer the min-opps floor for injury/rest games."
              >
                <input type="checkbox" checked={excludeZero} onChange={(e) => setExcludeZero(e.target.checked)} />
                Exclude 0 games
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                Min {marketDef.opportunityStat}
                <input
                  value={minOpp}
                  onChange={(e) => setMinOpp(e.target.value)}
                  inputMode="numeric"
                  className="w-12 px-2 py-1 text-xs border border-slate-200 rounded-lg"
                />
              </label>
            </div>

            {measured ? (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-center">
                {[
                  ['Games', String(measured.games)],
                  ['Mean', measured.mean.toFixed(1)],
                  ['Median', measured.median.toFixed(1)],
                  ['SD', measured.sd.toFixed(1)],
                  ['SD/Mean', measured.cv.toFixed(2)],
                  [`${marketDef.opportunityStat}/g`, measured.oppMean.toFixed(1)],
                ].map(([label, val]) => (
                  <div key={label} className="bg-slate-50 rounded-lg py-2">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
                    <div className="text-sm font-semibold tabular-nums">{val}</div>
                  </div>
                ))}
              </div>
            ) : (
              !gamesLoading && (
                <div className="text-xs text-slate-400">
                  Not enough games in the selected window (need 2+).
                </div>
              )
            )}

            {measured && measured.mean > measured.median && (
              <div className="text-xs text-amber-600">
                Mean &gt; median by {(measured.mean - measured.median).toFixed(1)} — boom/bust pattern
                present; the Boom/Bust number is the honest one at the main line.
              </div>
            )}
            {leagueMult !== null && (
              <div className="text-xs text-slate-400">
                League {position} multiplier {leagueMult}
                {tierMult !== null && ` · tier ${tierMult}`}
                {measured && ` · this player ${measured.cv.toFixed(2)}`}
              </div>
            )}

            {/* Game log — uncheck a row to exclude that game from the sample */}
            {playerGames.length > 0 && seasonsSelected.length > 0 && (
              <div>
                <button
                  onClick={() => setShowGameLog(!showGameLog)}
                  className="text-xs font-medium text-slate-500 hover:text-slate-700 transition"
                >
                  {showGameLog ? '▾' : '▸'} Game log
                  {excludedGames.size > 0 && (
                    <span className="ml-1.5 text-amber-600">({excludedGames.size} excluded by hand)</span>
                  )}
                </button>
                {showGameLog && (() => {
                  const minOppN = Number(minOpp) || 0;
                  const rows = playerGames
                    .filter((g) => seasonsSelected.includes(g.season))
                    .filter((g) => (includePost ? true : g.season_type === 'REG'))
                    .sort((a, b) => b.season - a.season || b.week - a.week);
                  return (
                    <div className="mt-1.5 overflow-x-auto">
                      <table className="text-xs">
                        <thead>
                          <tr className="text-left text-slate-400 uppercase tracking-wide">
                            <th className="py-1 pr-2">In</th>
                            <th className="py-1 pr-3">Season</th>
                            <th className="py-1 pr-3">Wk</th>
                            <th className="py-1 pr-3">Opp</th>
                            <th className="py-1 pr-3 text-right">{marketDef.opportunityStat}</th>
                            <th className="py-1 pr-3 text-right">{marketDef.label}</th>
                            <th className="py-1"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((g) => {
                            const k = gameKey(g);
                            const opp = g[marketDef.opportunityStat] ?? 0;
                            const val = g[marketDef.stat] ?? 0;
                            const manualOut = excludedGames.has(k);
                            const autoOut = !manualOut && (opp < minOppN || (excludeZero && val <= 0));
                            const out = manualOut || autoOut;
                            return (
                              <tr key={k} className={`border-t border-slate-100 ${out ? 'opacity-45' : ''}`}>
                                <td className="py-1 pr-2">
                                  <input
                                    type="checkbox"
                                    checked={!manualOut}
                                    onChange={() =>
                                      setExcludedGames((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(k)) next.delete(k); else next.add(k);
                                        return next;
                                      })
                                    }
                                  />
                                </td>
                                <td className="py-1 pr-3 tabular-nums">{g.season}</td>
                                <td className="py-1 pr-3 tabular-nums">
                                  {g.week}{g.season_type !== 'REG' ? ' P' : ''}
                                </td>
                                <td className="py-1 pr-3">{g.opponent ?? '—'}</td>
                                <td className="py-1 pr-3 text-right tabular-nums text-slate-500">{opp}</td>
                                <td className={`py-1 pr-3 text-right tabular-nums font-medium ${
                                  measured && !out ? (val >= measured.median ? 'text-emerald-600' : 'text-red-500') : ''
                                }`}>
                                  {val}
                                </td>
                                <td className="py-1 text-[10px] text-slate-400">
                                  {manualOut ? 'excluded' : autoOut ? (opp < minOppN ? 'min-opps' : 'zero') : ''}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* Pricing */}
        {(selectedPlayer || playerQuotes.length > 0) && (
          <div className={`${cardCls} space-y-4`} style={themedCard}>
            <div className="text-sm font-semibold">Price It</div>

            {/* Two clean rows: YOUR MODEL (projection / SD / curve) with one
                combined explainer line, then THE BOOK'S OFFER (line + prices)
                with the model-fair verdict as a stat chip on the right. */}
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">Your model</div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-24">
                  <label className={labelCls}>Projection</label>
                  <input
                    value={projection}
                    onChange={(e) => { setProjection(e.target.value); setProjectionEdited(e.target.value !== ''); }}
                    inputMode="decimal"
                    className={fieldCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Volatility</label>
                  <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                    {([
                      ['measured', measured ? `Measured ${measured.sd.toFixed(1)}` : 'Measured'],
                      ['tier', tierMult !== null && hasProj ? `Tier ${(tierMult * projNum).toFixed(1)}` : 'Tier'],
                      ['league', leagueMult !== null && hasProj ? `League ${(leagueMult * projNum).toFixed(1)}` : 'League'],
                      ['custom', 'Custom'],
                    ] as const).map(([mode, label]) => (
                      <button
                        key={mode}
                        onClick={() => setSdMode(mode)}
                        className={`px-2.5 py-2 text-xs font-medium transition whitespace-nowrap ${
                          sdMode === mode ? 'bg-[#0052ff] text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {sdMode === 'custom' && (
                  <div className="w-20">
                    <label className={labelCls}>Amount</label>
                    <input value={sdCustom} onChange={(e) => setSdCustom(e.target.value)} inputMode="decimal" className={fieldCls} />
                  </div>
                )}
                <div>
                  <label className={labelCls}>Curve</label>
                  <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                    {([
                      ['auto', `Auto (${autoDist.dist === 'lognormal' ? 'Boom/Bust' : 'Balanced'})`],
                      ['normal', 'Balanced'],
                      ['lognormal', 'Boom/Bust'],
                    ] as const).map(([mode, label]) => (
                      <button
                        key={mode}
                        onClick={() => setDistMode(mode)}
                        className={`px-2.5 py-2 text-xs font-medium transition whitespace-nowrap ${
                          distMode === mode ? 'bg-[#0052ff] text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {/* One combined explainer line for the whole model row */}
              <div className="text-[11px] leading-snug text-slate-400">
                <span className="font-medium text-slate-500">Projection</span> = his average — the curve
                derives the median.
                {' · '}
                <span className="font-medium text-slate-500">Volatility</span>{' '}
                {sdMode === 'measured' && `= his own game-to-game swings${measured ? ` (${measured.values.length} games)` : ''}.`}
                {sdMode === 'tier' && '= players at his projected volume (rookie/new-role fallback).'}
                {sdMode === 'league' && `= all ${position}s blended (coarse backstop).`}
                {sdMode === 'custom' && '= set by hand.'}
                {' · '}
                <span className="font-medium text-slate-500">Curve</span>{' '}
                {distMode !== 'auto' && '= set by hand.'}
                {distMode === 'auto' && (autoDist.basis === 'shape' && measured
                  ? autoDist.dist === 'lognormal'
                    ? `auto from his shape: average ${(measured.mean - measured.median).toFixed(1)} above his typical game — boom/bust.`
                    : `auto from his shape: average ≈ typical (${measured.mean.toFixed(1)} vs ${measured.median.toFixed(1)}) — steady.`
                  : 'auto = market default (needs 8+ games to read his shape).')}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">The book&apos;s offer</div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-24">
                  <label className={labelCls}>Line</label>
                  {bookLines.length > 0 ? (
                    <select value={lineInput} onChange={(e) => setLineInput(e.target.value)} className={fieldCls}>
                      {bookLines.map((l) => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                  ) : (
                    <input value={lineInput} onChange={(e) => setLineInput(e.target.value)} inputMode="decimal" placeholder="72.5" className={fieldCls} />
                  )}
                </div>
                <div className="w-24">
                  <label className={labelCls}>Over price</label>
                  <input
                    value={overPriceInput}
                    onChange={(e) => setOverPriceInput(e.target.value)}
                    inputMode="numeric"
                    placeholder="-120"
                    title="American odds (±100 or beyond)"
                    className={`${fieldCls}${overPriceInput && overPrice === null ? ' ring-2 ring-red-300' : ''}`}
                  />
                </div>
                <div className="w-24">
                  <label className={labelCls}>Under price</label>
                  <input
                    value={underPriceInput}
                    onChange={(e) => setUnderPriceInput(e.target.value)}
                    inputMode="numeric"
                    placeholder="-102"
                    title="American odds (±100 or beyond)"
                    className={`${fieldCls}${underPriceInput && underPrice === null ? ' ring-2 ring-red-300' : ''}`}
                  />
                </div>
                {/* Model fair verdict chip: where P(over)=50% (projection for
                    Balanced, lognormal median for Boom/Bust) vs the book */}
                {hasProj && sd !== null && sd > 0 && (() => {
                  const fairLine = dist === 'normal' ? projNum : lognormalParams(projNum, sd).median;
                  const diff = hasLine ? line - fairLine : null;
                  return (
                    <div className="ml-auto text-center bg-slate-50 rounded-lg px-3 py-1.5">
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">Model fair line</div>
                      <div className="text-sm font-semibold tabular-nums">
                        {fairLine.toFixed(1)}
                        {diff !== null && Math.abs(diff) >= 0.5 && (
                          <span className={`ml-1 text-xs font-medium ${diff > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                            book {diff > 0 ? '+' : ''}{diff.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {hasProj && sd !== null && sd > 0 && (
              <>
                <DistributionChart
                  values={measured?.values ?? []}
                  mean={projNum}
                  sd={sd}
                  line={hasLine ? line : null}
                  dist={dist}
                  unit={MARKET_UNITS[marketDef.key] ?? ''}
                />
                {/* One-sentence automatic chart read: the single most relevant
                    thing the picture is saying, in plain English. Priority:
                    bust-dragged average (don't trust the curves yet) > line
                    vs typical game > boom-inflated average. */}
                {measured && (() => {
                  const gap = measured.mean - measured.median;
                  const rel = measured.median > 0 ? gap / measured.median : 0;
                  let read: string | null = null;
                  if (rel < -0.08) {
                    read = `His average (${measured.mean.toFixed(1)}) sits BELOW his typical game (${measured.median.toFixed(1)}) — dud games are dragging it down, so the curves sit left of his real cluster; vet the log (Min ${marketDef.opportunityStat} / Exclude 0) before trusting the verdict.`;
                  } else if (hasLine) {
                    const d = line - measured.median;
                    if (Math.abs(d) <= Math.max(2, 0.04 * measured.median)) {
                      read = `The line (${line}) sits right on his typical game (${measured.median.toFixed(1)}) — his history alone calls this a near coin-flip; the curves add the shape.`;
                    } else if (d > 0) {
                      read = `The line (${line}) is ${d.toFixed(1)} above his typical game (${measured.median.toFixed(1)}) — the Over needs a better-than-usual day.`;
                    } else {
                      read = `The line (${line}) is ${(-d).toFixed(1)} below his typical game (${measured.median.toFixed(1)}) — the Under needs a worse-than-usual day.`;
                    }
                  } else if (rel > 0.08) {
                    read = `Booms lift his average ${gap.toFixed(1)} above his typical game (${measured.median.toFixed(1)}) — trust the Boom/Bust number at the main line.`;
                  }
                  return read ? (
                    <div className="text-xs text-slate-500">
                      <span className="font-medium text-slate-600">Chart read:</span> {read}
                    </div>
                  ) : null;
                })()}
              </>
            )}

            {result && sd !== null && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-center">
                  <div className="bg-slate-50 rounded-lg py-2.5">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">P(Over) Balanced</div>
                    <div className={`text-sm tabular-nums ${dist === 'normal' ? 'font-bold' : 'text-slate-500'}`}>
                      {fmtPct(result.pNormal)}
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-lg py-2.5">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">P(Over) Boom/Bust</div>
                    <div className={`text-sm tabular-nums ${dist === 'lognormal' ? 'font-bold' : 'text-slate-500'}`}>
                      {fmtPct(result.pLog)}
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-lg py-2.5">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">Fair Over</div>
                    <div className="text-sm font-semibold tabular-nums">{fmtAmerican(result.fair)}</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg py-2.5">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">Fair Under</div>
                    <div className="text-sm font-semibold tabular-nums">{fmtAmerican(result.fairUnder)}</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg py-2.5">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">Breakeven</div>
                    <div className="text-sm tabular-nums">{fmtPct(result.breakeven)}</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg py-2.5">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">Market Fair</div>
                    <div className="text-sm tabular-nums">
                      {marketFair ? fmtPct(marketFair.pOver) : '—'}
                      {marketFair && marketFair.books > 0 && (
                        <span className="text-[10px] text-slate-400"> ({marketFair.books}bk)</span>
                      )}
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-lg py-2.5">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">Overround</div>
                    <div className="text-sm tabular-nums">{marketFair ? fmtPct(marketFair.overround) : '—'}</div>
                  </div>
                  <div className={`rounded-lg py-2.5 ${result.ev !== null && result.ev > 0 ? 'bg-emerald-50' : 'bg-slate-50'}`}>
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">EV (Over)</div>
                    <div className={`text-sm tabular-nums ${evCls(result.ev)}`}>
                      {result.ev !== null ? `${result.ev > 0 ? '+' : ''}${(result.ev * 100).toFixed(1)}%` : '—'}
                    </div>
                  </div>
                  <div className={`rounded-lg py-2.5 ${result.evUnder !== null && result.evUnder > 0 ? 'bg-emerald-50' : 'bg-slate-50'}`}>
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">EV (Under)</div>
                    <div className={`text-sm tabular-nums ${evCls(result.evUnder)}`}>
                      {result.evUnder !== null ? `${result.evUnder > 0 ? '+' : ''}${(result.evUnder * 100).toFixed(1)}%` : '—'}
                    </div>
                  </div>
                </div>

                {marketFair && Math.abs(result.p - marketFair.pOver) > 0.12 && (
                  <div className="text-xs text-amber-600">
                    Your number is {fmtPct(Math.abs(result.p - marketFair.pOver))} from the market&apos;s fair
                    number — more likely you&apos;re missing something than the whole market is.
                  </div>
                )}
              </>
            )}

            {/* Ladder */}
            {ladder.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Ladder — {dist === 'lognormal' ? 'Boom/Bust' : 'Balanced'}
                  </div>
                  {bookLines.length <= 1 && (
                    <span className="text-[10px] text-slate-400">synthetic lines (load alt lines for book prices)</span>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-500 uppercase tracking-wide">
                        <th className="py-1.5 pr-3">Line</th>
                        <th className="py-1.5 pr-3 text-right">P(Over)</th>
                        <th className="py-1.5 pr-3 text-right">Fair</th>
                        <th className="py-1.5 pr-3 text-right">Best Over</th>
                        <th className="py-1.5 pr-3 text-right">EV Over</th>
                        <th className="py-1.5 pr-3 text-right">Best Under</th>
                        <th className="py-1.5 text-right">EV Under</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ladder.map((r) => {
                        const overQ = bestAt(r.line, 'over');
                        const underQ = bestAt(r.line, 'under');
                        return (
                          <tr
                            key={r.line}
                            className={`border-t border-slate-100 ${hasLine && r.line === line ? 'bg-blue-50/60' : ''}`}
                          >
                            <td className="py-1.5 pr-3 font-medium tabular-nums">{r.line}</td>
                            <td className="py-1.5 pr-3 text-right tabular-nums">{fmtPct(r.pOver)}</td>
                            <td className="py-1.5 pr-3 text-right tabular-nums text-slate-500">{fmtAmerican(r.fairOver)}</td>
                            <td className="py-1.5 pr-3 text-right tabular-nums">
                              {fmtAmerican(r.overOdds)}
                              {overQ && <span className="text-[10px] text-slate-400"> {overQ.book}</span>}
                            </td>
                            <td className={`py-1.5 pr-3 text-right tabular-nums ${evCls(r.overEv)}`}>
                              {r.overEv !== null ? `${r.overEv > 0 ? '+' : ''}${(r.overEv * 100).toFixed(1)}%` : '—'}
                            </td>
                            <td className="py-1.5 pr-3 text-right tabular-nums">
                              {fmtAmerican(r.underOdds)}
                              {underQ && <span className="text-[10px] text-slate-400"> {underQ.book}</span>}
                            </td>
                            <td className={`py-1.5 text-right tabular-nums ${evCls(r.underEv)}`}>
                              {r.underEv !== null ? `${r.underEv > 0 ? '+' : ''}${(r.underEv * 100).toFixed(1)}%` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="text-[11px] text-slate-400 pb-6">
          Projection = mean; the market prices the median. Yardage props are right-skewed, so at the main line the
          over is worse than the symmetric math says — deep alt overs can be better. Multipliers derived from
          nflverse game logs (median SD/mean across qualifying player-seasons, 8+ games, real role).
        </div>
      </div>
    </div>
  );
}
