'use client';

// src/app/admin/fcs-ratings/page.tsx
// Admin: FCS market-driven power ratings.
// Seeded from Massey FCS Pwr, adjusted by closing lines (half-the-difference,
// zero-sum). Massey seed runs locally (puppeteer, same as KenPom); Sync Games
// and manual closing lines work on Vercel too.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FcsClosingLine,
  FcsGameAdjustment,
  FcsManualAdjustment,
  FcsTeamRating,
} from '@/lib/fcs/types';
import { useTeamColorMap } from '@/lib/myGameBets';

const btnCls =
  'px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed';
const primaryBtnCls =
  'px-3 py-2 text-sm font-medium rounded-lg bg-[#0052ff] text-white hover:bg-[#0043d1] disabled:opacity-50 disabled:cursor-not-allowed';

type SortKey = 'rating' | 'team' | 'delta' | 'games';

interface RatingsResponse {
  success: boolean;
  season: number;
  ratings: FcsTeamRating[];
  adjustments: FcsGameAdjustment[];
  totalAdjustments: number;
  unlinedGames: FcsClosingLine[];
  manualAdjustments: FcsManualAdjustment[];
  pendingManualCount: number;
  error?: string;
}

type HistoryEntry =
  | { kind: 'game'; date: string; adj: FcsGameAdjustment; isHome: boolean }
  | { kind: 'manual'; date: string; m: FcsManualAdjustment };

interface UpcomingGame {
  gameId: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeRating: number;
  awayRating: number;
  isNeutralSite: boolean;
  hfaApplied: number;
  projectedSpread: number;
  marketSpread: number | null;
  marketBooks: number;
  edge: number | null;
  state: string;
}

interface TeamVisual {
  logo: string | null;
  color: string; // css hex with #
}

const FALLBACK_COLOR = '#64748b';

const normalizeKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const localYmd = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function TeamChip({
  name,
  visual,
  sub,
  warn,
}: {
  name: string;
  visual: TeamVisual;
  sub?: string | null;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      {visual.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={visual.logo}
          alt=""
          className="w-6 h-6 object-contain shrink-0"
          loading="lazy"
        />
      ) : (
        <span
          className="w-6 h-6 rounded-full shrink-0"
          style={{ backgroundColor: `${visual.color}33` }}
        />
      )}
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-800 truncate">
          {name}
          {warn && (
            <span
              className="ml-1.5 text-amber-500"
              title="No ESPN link — games for this team will be skipped. Add an override in src/lib/fcs/teamNames.ts and re-seed."
            >
              ⚠
            </span>
          )}
        </div>
        {sub ? <div className="text-[11px] text-slate-400 truncate">{sub}</div> : null}
      </div>
    </div>
  );
}

export default function FcsRatingsAdminPage() {
  const [data, setData] = useState<RatingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [confFilter, setConfFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('rating');
  const [sortDesc, setSortDesc] = useState(true);
  const [manualSpreads, setManualSpreads] = useState<Record<string, string>>({});
  const [savingLine, setSavingLine] = useState<string | null>(null);
  const [view, setView] = useState<'ratings' | 'upcoming'>('ratings');
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [manualDelta, setManualDelta] = useState('');
  const [manualDate, setManualDate] = useState(() => localYmd(new Date()));
  const [manualNote, setManualNote] = useState('');
  const [editingManualId, setEditingManualId] = useState<number | null>(null);
  const [manualBusy, setManualBusy] = useState(false);
  const [upcoming, setUpcoming] = useState<UpcomingGame[] | null>(null);
  const [upcomingAttempted, setUpcomingAttempted] = useState(false);
  const [upcomingLoading, setUpcomingLoading] = useState(false);
  const [upcomingNote, setUpcomingNote] = useState<string | null>(null);

  const colorMap = useTeamColorMap('americanfootball_ncaaf');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/fcs/ratings');
      const json: RatingsResponse = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadUpcoming = useCallback(async () => {
    setUpcomingAttempted(true);
    setUpcomingLoading(true);
    setUpcomingNote(null);
    try {
      const res = await fetch('/api/fcs/upcoming?days=7');
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setUpcoming(json.games);
      if (json.oddsError) setUpcomingNote(`Book lines unavailable: ${json.oddsError}`);
    } catch (e) {
      setUpcomingNote(e instanceof Error ? e.message : 'Failed to load upcoming games');
    } finally {
      setUpcomingLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'upcoming' && !upcomingAttempted) loadUpcoming();
  }, [view, upcomingAttempted, loadUpcoming]);

  // team -> its history (newest first): game adjustments seen from that
  // team's side of the zero-sum split, merged with manual rating adjustments
  const teamHistory = useMemo(() => {
    const m = new Map<string, HistoryEntry[]>();
    const push = (t: string, e: HistoryEntry) => {
      if (!m.has(t)) m.set(t, []);
      m.get(t)!.push(e);
    };
    for (const a of data?.adjustments ?? []) {
      push(a.homeTeam, { kind: 'game', date: a.gameDate, adj: a, isHome: true });
      push(a.awayTeam, { kind: 'game', date: a.gameDate, adj: a, isHome: false });
    }
    for (const ma of data?.manualAdjustments ?? []) {
      push(ma.teamName, { kind: 'manual', date: ma.adjustDate, m: ma });
    }
    for (const list of m.values()) list.sort((x, y) => y.date.localeCompare(x.date));
    return m;
  }, [data]);

  // merged feed for the Recent adjustments panel (newest first)
  const feedEntries = useMemo(() => {
    const out: HistoryEntry[] = [
      ...(data?.adjustments ?? []).map(
        (a): HistoryEntry => ({ kind: 'game', date: a.gameDate, adj: a, isHome: true })
      ),
      ...(data?.manualAdjustments ?? []).map(
        (ma): HistoryEntry => ({ kind: 'manual', date: ma.adjustDate, m: ma })
      ),
    ];
    return out.sort((x, y) => y.date.localeCompare(x.date));
  }, [data]);

  // canonical team name -> rating row (for espn linkage from adjustments/lines)
  const byTeamName = useMemo(() => {
    const m = new Map<string, FcsTeamRating>();
    for (const r of data?.ratings ?? []) m.set(r.teamName, r);
    return m;
  }, [data]);

  const visualFor = useCallback(
    (teamName: string): TeamVisual => {
      const r = byTeamName.get(teamName);
      const info = r?.espnName ? colorMap?.[normalizeKey(r.espnName)] : undefined;
      const logo =
        info?.logo ??
        (r?.espnId ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${r.espnId}.png` : null);
      const color = info?.color ? `#${info.color}` : FALLBACK_COLOR;
      return { logo, color };
    },
    [byTeamName, colorMap]
  );

  const runAction = async (
    label: string,
    url: string,
    body: Record<string, unknown>,
    confirmText?: string
  ) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(label);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      if (url.includes('massey-sync')) {
        const unmatched = json.unmatched?.length
          ? ` Unmatched: ${json.unmatched.join(', ')}`
          : '';
        setMessage(
          `Massey: ${json.masseyTeams} teams — ${json.inserted} inserted, ${json.refreshed} refreshed, ${json.reseeded} reseeded.${unmatched}`
        );
      } else if (json.action === 'sync') {
        const noLine = (json.skipped ?? []).filter(
          (s: { reason: string }) => s.reason === 'no_line'
        ).length;
        setMessage(
          `Synced ${json.range.startDate} → ${json.range.endDate}: ${json.processedCount} games processed, ${json.skippedCount} skipped (${noLine} no line), ${json.oddsApiCalls} Odds API calls.`
        );
      } else {
        setMessage(
          `${json.action}: replayed ${json.gamesReplayed} games, rewrote ${json.adjustmentRowsRewritten} rows.`
        );
      }
      setUpcoming(null);
      setUpcomingAttempted(false); // projections depend on ratings — refetch
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : `${label} failed`);
    } finally {
      setBusy(null);
    }
  };

  const saveManualLine = async (gameId: string) => {
    // Normalize unicode minus/dash variants the iOS keyboard can produce
    const raw = (manualSpreads[gameId] ?? '').replace(/[−–—]/g, '-').trim();
    const spread = parseFloat(raw);
    if (!Number.isFinite(spread)) {
      setError('Enter the home closing spread, e.g. -6.5 (negative = home favored)');
      return;
    }
    setSavingLine(gameId);
    setError(null);
    try {
      const res = await fetch('/api/fcs/closing-line', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, closingSpread: spread }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setMessage(`Saved ${spread} — hit Sync Games to apply it.`);
      await load();
    } catch (e) {
      setMessage(null);
      setError(e instanceof Error ? e.message : 'Failed to save line');
    } finally {
      setSavingLine(null);
    }
  };

  const submitManualRating = async (teamName: string) => {
    const raw = manualDelta.replace(/[\u2212\u2013\u2014]/g, '-').trim();
    const delta = parseFloat(raw);
    if (!Number.isFinite(delta) || delta === 0) {
      setMessage(null);
      setError('Enter a non-zero rating change, e.g. 2.5 or -1.5');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(manualDate)) {
      setMessage(null);
      setError('Pick an "as of" date');
      return;
    }
    // Local midnight of the chosen day -> the adjustment applies before that
    // day's games and after everything earlier.
    const adjustDate = new Date(`${manualDate}T00:00:00`).toISOString();
    setManualBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/fcs/manual-adjustment', {
        method: editingManualId === null ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          editingManualId === null
            ? { teamName, delta, adjustDate, note: manualNote.trim() || undefined }
            : { id: editingManualId, delta, adjustDate, note: manualNote.trim() || null }
        ),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      if (json.replay?.success) {
        setMessage(
          `Manual adjustment ${editingManualId === null ? 'added' : 'updated'} and applied — ledger replayed (${json.replay.gamesReplayed} games, ${json.replay.manualApplied} manual).`
        );
      } else {
        setMessage(null);
        setError(json.replay?.error || 'Saved but not applied — run Recalculate.');
      }
      setManualDelta('');
      setManualNote('');
      setManualDate(localYmd(new Date()));
      setEditingManualId(null);
      setUpcoming(null);
      setUpcomingAttempted(false);
      await load();
    } catch (e) {
      setMessage(null);
      setError(e instanceof Error ? e.message : 'Failed to save adjustment');
    } finally {
      setManualBusy(false);
    }
  };

  const removeManualRating = async (id: number) => {
    if (
      !window.confirm(
        'Remove this manual rating adjustment? The ledger will be replayed without it.'
      )
    )
      return;
    setManualBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/fcs/manual-adjustment', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      if (json.replay?.success) {
        setMessage('Manual adjustment removed — ledger replayed.');
      } else {
        setMessage(null);
        setError(json.replay?.error || 'Removed, but replay failed — run Recalculate.');
      }
      if (editingManualId === id) {
        setEditingManualId(null);
        setManualDelta('');
        setManualNote('');
      }
      setUpcoming(null);
      setUpcomingAttempted(false);
      await load();
    } catch (e) {
      setMessage(null);
      setError(e instanceof Error ? e.message : 'Failed to remove adjustment');
    } finally {
      setManualBusy(false);
    }
  };

  const conferences = useMemo(() => {
    const set = new Set((data?.ratings ?? []).map((r) => r.conference || 'Unknown'));
    return [...set].sort();
  }, [data]);

  const rows = useMemo(() => {
    let list = data?.ratings ?? [];
    if (confFilter !== 'all') list = list.filter((r) => (r.conference || 'Unknown') === confFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.teamName.toLowerCase().includes(q) || r.masseyName.toLowerCase().includes(q)
      );
    }
    const dir = sortDesc ? -1 : 1;
    return [...list].sort((a, b) => {
      switch (sortKey) {
        case 'team':
          return dir * a.teamName.localeCompare(b.teamName);
        case 'delta':
          return dir * (a.rating - a.initialRating - (b.rating - b.initialRating));
        case 'games':
          return dir * (a.gamesProcessed - b.gamesProcessed);
        default:
          return dir * (a.rating - b.rating);
      }
    });
  }, [data, search, confFilter, sortKey, sortDesc]);

  const setSort = (key: SortKey) => {
    if (sortKey === key) setSortDesc((d) => !d);
    else {
      setSortKey(key);
      setSortDesc(key !== 'team');
    }
  };

  const sortChip = (key: SortKey, label: string) => (
    <button
      key={key}
      onClick={() => setSort(key)}
      className={`px-2.5 py-1 rounded-full text-xs font-medium transition whitespace-nowrap ${
        sortKey === key
          ? 'bg-slate-800 text-white'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {label}
      {sortKey === key ? (sortDesc ? ' ↓' : ' ↑') : ''}
    </button>
  );

  const fmtDelta = (d: number, small = false) => {
    const v = Math.round(d * 100) / 100;
    if (v === 0) return <span className="text-slate-400">0.00</span>;
    return (
      <span className={v > 0 ? 'text-emerald-600' : small ? 'text-red-500' : 'text-red-600'}>
        {v > 0 ? '+' : ''}
        {v.toFixed(2)}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 p-3 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
        <div className="space-y-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-800">FCS Power Ratings</h1>
            <p className="text-xs sm:text-sm text-slate-500">
              Massey seed → market-adjusted by closing lines · {data?.totalAdjustments ?? 0}{' '}
              games · season {data?.season ?? ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className={`${primaryBtnCls} flex-1 sm:flex-none`}
              disabled={busy !== null || (data?.ratings.length ?? 0) === 0}
              onClick={() => runAction('sync', '/api/fcs/calculate', { action: 'sync' })}
            >
              {busy === 'sync' ? 'Syncing…' : 'Sync Games'}
            </button>
            <button
              className={`${btnCls} flex-1 sm:flex-none`}
              disabled={busy !== null}
              onClick={() =>
                runAction('seed', '/api/fcs/massey-sync', {},
                  data && data.ratings.length > 0
                    ? 'Ratings already exist. This refreshes metadata (HFA/conference) without touching adjusted ratings. Continue?'
                    : undefined
                )
              }
            >
              {busy === 'seed' ? 'Scraping…' : 'Seed Massey'}
            </button>
            <button
              className={`${btnCls} flex-1 sm:flex-none`}
              disabled={busy !== null || (data?.totalAdjustments ?? 0) === 0}
              onClick={() =>
                runAction(
                  'recalc',
                  '/api/fcs/calculate',
                  { action: 'recalculate' },
                  'Reset all teams to their Massey seed and replay every game chronologically?'
                )
              }
            >
              {busy === 'recalc' ? 'Recalculating…' : 'Recalculate'}
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}
        {message && (
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
            {message}
          </div>
        )}
        {(data?.pendingManualCount ?? 0) > 0 && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700">
            {data!.pendingManualCount} manual rating{' '}
            {data!.pendingManualCount === 1 ? 'adjustment has' : 'adjustments have'} not
            been applied yet — hit Recalculate to sync the ratings.
          </div>
        )}

        <div className="grid grid-cols-2 bg-slate-200/70 rounded-full p-0.5">
          {(['ratings', 'upcoming'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`py-1.5 rounded-full text-sm font-medium transition ${
                view === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
              }`}
            >
              {v === 'ratings' ? 'Ratings' : 'Upcoming'}
            </button>
          ))}
        </div>

        {view === 'upcoming' && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-3 sm:px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-slate-700">
                  Projected spreads — next 7 days
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Model = rating gap + home HFA. Edge = model vs current book consensus.
                </div>
              </div>
              <button className={btnCls} disabled={upcomingLoading} onClick={loadUpcoming}>
                {upcomingLoading ? '…' : 'Refresh'}
              </button>
            </div>
            {upcomingNote && (
              <div className="px-3 sm:px-4 py-2 text-xs text-amber-600 border-b border-slate-100">
                {upcomingNote}
              </div>
            )}
            {upcomingLoading && upcoming === null ? (
              <div className="px-4 py-6 text-sm text-slate-500">Loading…</div>
            ) : (upcoming ?? []).length === 0 ? (
              <div className="px-4 py-6 text-sm text-slate-500">
                No upcoming FCS-vs-FCS games in the next 7 days.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {(() => {
                  const groups: Array<{ label: string; games: UpcomingGame[] }> = [];
                  for (const g of upcoming ?? []) {
                    const label = new Date(g.date).toLocaleDateString(undefined, {
                      weekday: 'long',
                      month: 'short',
                      day: 'numeric',
                    });
                    const last = groups[groups.length - 1];
                    if (last && last.label === label) last.games.push(g);
                    else groups.push({ label, games: [g] });
                  }
                  return groups.map((grp) => (
                    <div key={grp.label}>
                      <div className="px-3 sm:px-4 py-1.5 bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                        {grp.label}
                      </div>
                      {grp.games.map((g) => {
                        const fav = g.projectedSpread <= 0 ? g.homeTeam : g.awayTeam;
                        const favSpread = -Math.abs(g.projectedSpread);
                        const edgeSide =
                          g.edge === null || g.edge === 0
                            ? null
                            : g.edge > 0
                              ? g.homeTeam
                              : g.awayTeam;
                        const bigEdge = g.edge !== null && Math.abs(g.edge) >= 2;
                        return (
                          <div key={g.gameId} className="px-3 sm:px-4 py-2.5 border-t border-slate-100">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0 space-y-1">
                                <TeamChip
                                  name={g.awayTeam}
                                  visual={visualFor(g.awayTeam)}
                                  sub={g.awayRating.toFixed(1)}
                                />
                                <TeamChip
                                  name={g.homeTeam}
                                  visual={visualFor(g.homeTeam)}
                                  sub={g.homeRating.toFixed(1)}
                                />
                              </div>
                              <div className="text-right shrink-0 space-y-0.5">
                                <div className="text-[11px] text-slate-400">
                                  {new Date(g.date).toLocaleTimeString(undefined, {
                                    hour: 'numeric',
                                    minute: '2-digit',
                                  })}
                                  {g.isNeutralSite ? ' · N' : ''}
                                  {' · HFA '}
                                  {g.hfaApplied.toFixed(2)}
                                  {g.state === 'in' ? ' · LIVE' : ''}
                                </div>
                                <div className="text-sm font-semibold text-slate-800 tabular-nums whitespace-nowrap">
                                  {fav.length > 14 ? `${fav.slice(0, 13)}…` : fav}{' '}
                                  {favSpread.toFixed(1)}
                                </div>
                                <div className="text-xs text-slate-500 tabular-nums whitespace-nowrap">
                                  {g.marketSpread === null
                                    ? 'no book line'
                                    : `book ${g.marketSpread.toFixed(1)} (${g.marketBooks})`}
                                </div>
                                {edgeSide && (
                                  <div
                                    className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium tabular-nums ${
                                      bigEdge
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : 'bg-slate-100 text-slate-500'
                                    }`}
                                  >
                                    edge: {edgeSide.length > 12 ? `${edgeSide.slice(0, 11)}…` : edgeSide}{' '}
                                    {Math.abs(g.edge!).toFixed(1)}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>
        )}

        {view === 'ratings' && (data?.unlinedGames ?? []).length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-3 sm:px-4 py-3 border-b border-slate-100">
              <div className="text-sm font-semibold text-slate-700">
                Games missing a closing line ({data!.unlinedGames.length})
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Enter the closing spread from the home team&apos;s perspective (negative =
                home favored), then Sync Games to apply.
              </div>
            </div>
            <div className="max-h-[45vh] overflow-y-auto divide-y divide-slate-100">
              {data!.unlinedGames.map((g) => {
                const away = g.awayTeam ?? '';
                const home = g.homeTeam ?? '';
                return (
                  <div key={g.gameId} className="px-3 sm:px-4 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <TeamChip name={away} visual={visualFor(away)} />
                        <div className="flex items-center gap-2">
                          <TeamChip name={home} visual={visualFor(home)} />
                          <span className="text-[11px] text-slate-400 shrink-0">
                            {g.isNeutralSite ? 'vs (N)' : 'home'} ·{' '}
                            {g.gameDate
                              ? new Date(g.gameDate).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                })
                              : ''}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <input
                          type="text"
                          autoComplete="off"
                          autoCorrect="off"
                          className="w-20 px-2 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0052ff]/25"
                          placeholder="-6.5"
                          value={manualSpreads[g.gameId] ?? ''}
                          onChange={(e) =>
                            setManualSpreads((m) => ({ ...m, [g.gameId]: e.target.value }))
                          }
                        />
                        <button
                          className={btnCls}
                          disabled={savingLine !== null || !(manualSpreads[g.gameId] ?? '').trim()}
                          onClick={() => saveManualLine(g.gameId)}
                        >
                          {savingLine === g.gameId ? '…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {view === 'ratings' && (<>
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              className="flex-1 min-w-0 px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0052ff]/25"
              placeholder="Search team…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="px-2 py-2 text-sm bg-white border border-slate-200 rounded-lg max-w-[45%]"
              value={confFilter}
              onChange={(e) => setConfFilter(e.target.value)}
            >
              <option value="all">All conferences</option>
              {conferences.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {sortChip('rating', 'Rating')}
            {sortChip('delta', 'Δ Market')}
            {sortChip('games', 'Games')}
            {sortChip('team', 'A–Z')}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="hidden sm:grid grid-cols-[2.5rem_1fr_5.5rem_5rem_5rem_3.5rem_3rem] items-center px-3 py-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100">
            <div>#</div>
            <div>Team</div>
            <div className="text-right">Rating</div>
            <div className="text-right">Δ Market</div>
            <div className="text-right">Seed</div>
            <div className="text-right">HFA</div>
            <div className="text-right">G</div>
          </div>
          {loading ? (
            <div className="px-4 py-6 text-sm text-slate-500">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-500">
              No ratings yet — run &quot;Seed Massey&quot; (local dev server; puppeteer).
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {rows.map((r, i) => {
                const v = visualFor(r.teamName);
                const delta = r.rating - r.initialRating;
                const isOpen = expandedTeam === r.teamName;
                const history = teamHistory.get(r.teamName) ?? [];
                return (
                  <div key={r.teamName}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setExpandedTeam(isOpen ? null : r.teamName);
                        setEditingManualId(null);
                        setManualDelta('');
                        setManualNote('');
                        setManualDate(localYmd(new Date()));
                      }}
                      className="grid grid-cols-[1.75rem_1fr_auto] sm:grid-cols-[2.5rem_1fr_5.5rem_5rem_5rem_3.5rem_3rem] items-center px-2 sm:px-3 py-2 cursor-pointer"
                      style={{
                        boxShadow: `inset 3px 0 0 ${v.color}`,
                        background: `linear-gradient(90deg, ${v.color}0d, transparent 55%)`,
                      }}
                    >
                      <div className="text-xs text-slate-400 tabular-nums">{i + 1}</div>
                      <TeamChip
                        name={r.teamName}
                        visual={v}
                        sub={r.conference}
                        warn={!r.espnName}
                      />
                      <div className="text-right">
                        <div className="text-sm font-semibold text-slate-800 tabular-nums">
                          {r.rating.toFixed(2)}
                          <span className="ml-1 text-[10px] text-slate-400">
                            {isOpen ? '\u25be' : '\u25b8'}
                          </span>
                        </div>
                        <div className="text-[11px] tabular-nums sm:hidden">
                          {fmtDelta(delta, true)}
                        </div>
                      </div>
                      <div className="hidden sm:block text-right text-sm tabular-nums">
                        {fmtDelta(delta)}
                      </div>
                      <div className="hidden sm:block text-right text-sm text-slate-500 tabular-nums">
                        {r.initialRating.toFixed(2)}
                      </div>
                      <div className="hidden sm:block text-right text-sm text-slate-500 tabular-nums">
                        {r.hfa?.toFixed(2) ?? '\u2014'}
                      </div>
                      <div className="hidden sm:block text-right text-sm text-slate-500 tabular-nums">
                        {r.gamesProcessed}
                      </div>
                    </div>
                    {isOpen && (
                      <div className="px-3 sm:px-4 py-2 bg-slate-50/70 border-t border-slate-100">
                        <div className="text-[11px] text-slate-400 mb-1.5">
                          Massey seed {r.initialRating.toFixed(2)} {'\u2192'} now{' '}
                          {r.rating.toFixed(2)} ({r.gamesProcessed} market-lined{' '}
                          {r.gamesProcessed === 1 ? 'game' : 'games'})
                        </div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <input
                            type="text"
                            autoComplete="off"
                            autoCorrect="off"
                            className="w-16 px-2 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0052ff]/25"
                            placeholder="+2.5"
                            value={manualDelta}
                            onChange={(e) => setManualDelta(e.target.value)}
                          />
                          <input
                            type="date"
                            className="px-2 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0052ff]/25"
                            title="As of — applies from this date forward"
                            value={manualDate}
                            onChange={(e) => setManualDate(e.target.value)}
                          />
                          <input
                            type="text"
                            autoComplete="off"
                            className="flex-1 min-w-0 px-2 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0052ff]/25"
                            placeholder="note (optional)"
                            value={manualNote}
                            onChange={(e) => setManualNote(e.target.value)}
                          />
                          <button
                            className={btnCls}
                            disabled={manualBusy || !manualDelta.trim()}
                            onClick={() => submitManualRating(r.teamName)}
                          >
                            {manualBusy ? '\u2026' : editingManualId === null ? 'Adjust' : 'Update'}
                          </button>
                          {editingManualId !== null && (
                            <button
                              className={btnCls}
                              onClick={() => {
                                setEditingManualId(null);
                                setManualDelta('');
                                setManualNote('');
                                setManualDate(localYmd(new Date()));
                              }}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                        {history.length === 0 ? (
                          <div className="text-xs text-slate-500 pb-1">
                            No adjustments yet \u2014 market-lined games and manual tweaks
                            will appear here.
                          </div>
                        ) : (
                          <div className="space-y-1.5 pb-1">
                            {history.map((e) => {
                              if (e.kind === 'manual') {
                                const ma = e.m;
                                return (
                                  <div
                                    key={`m${ma.id}`}
                                    className="flex items-center justify-between gap-2"
                                  >
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className="text-[11px] text-violet-500 w-7 shrink-0">
                                        man
                                      </span>
                                      <div className="min-w-0">
                                        <div className="text-sm font-medium text-violet-700">
                                          Manual adjustment
                                          {ma.pending && (
                                            <span className="ml-1.5 text-[10px] text-amber-600 font-semibold">
                                              NOT APPLIED
                                            </span>
                                          )}
                                        </div>
                                        {ma.note && (
                                          <div className="text-[11px] text-slate-400 truncate">
                                            {ma.note}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                      <div className="text-xs tabular-nums">
                                        {fmtDelta(ma.delta, true)}{' '}
                                        {ma.ratingBefore !== null && ma.ratingAfter !== null && (
                                          <span className="text-slate-500">
                                            ({ma.ratingBefore.toFixed(2)} {'\u2192'}{' '}
                                            {ma.ratingAfter.toFixed(2)})
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[11px] text-slate-400">
                                        as of{' '}
                                        {new Date(ma.adjustDate).toLocaleDateString(undefined, {
                                          month: 'short',
                                          day: 'numeric',
                                        })}
                                        {' \u00b7 '}
                                        <button
                                          className="underline"
                                          onClick={() => {
                                            setEditingManualId(ma.id);
                                            setManualDelta(String(ma.delta));
                                            setManualNote(ma.note ?? '');
                                            setManualDate(localYmd(new Date(ma.adjustDate)));
                                          }}
                                        >
                                          edit
                                        </button>
                                        {' \u00b7 '}
                                        <button
                                          className="underline"
                                          onClick={() => removeManualRating(ma.id)}
                                        >
                                          remove
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              }
                              const a = e.adj;
                              const isHome = e.isHome;
                              const opp = isHome ? a.awayTeam : a.homeTeam;
                              const myDelta = isHome ? -a.adjustment : a.adjustment;
                              const before = isHome
                                ? a.homeRatingBefore
                                : a.awayRatingBefore;
                              const after = isHome
                                ? a.homeRatingAfter
                                : a.awayRatingAfter;
                              return (
                                <div
                                  key={a.gameId}
                                  className="flex items-center justify-between gap-2"
                                >
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="text-[11px] text-slate-400 w-7 shrink-0">
                                      {a.isNeutralSite ? 'N' : isHome ? 'vs' : '@'}
                                    </span>
                                    <TeamChip name={opp} visual={visualFor(opp)} />
                                  </div>
                                  <div className="text-right shrink-0">
                                    <div className="text-xs tabular-nums">
                                      {fmtDelta(myDelta, true)}{' '}
                                      <span className="text-slate-500">
                                        ({before.toFixed(2)} {'\u2192'} {after.toFixed(2)})
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-slate-400 tabular-nums">
                                      {new Date(a.gameDate).toLocaleDateString(undefined, {
                                        month: 'short',
                                        day: 'numeric',
                                      })}{' '}
                                      {'\u00b7'} proj {a.projectedSpread.toFixed(1)}{' '}
                                      {'\u2192'} close {a.closingSpread.toFixed(1)}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-3 sm:px-4 py-3 border-b border-slate-100 text-sm font-semibold text-slate-700">
            Recent adjustments
          </div>
          {feedEntries.length === 0 && !loading ? (
            <div className="px-4 py-5 text-sm text-slate-500">No adjustments yet.</div>
          ) : (
            <div className="max-h-[55vh] overflow-y-auto divide-y divide-slate-100">
              {feedEntries.slice(0, 200).map((e) => {
                if (e.kind === 'manual') {
                  const ma = e.m;
                  return (
                    <div key={`m${ma.id}`} className="px-3 sm:px-4 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <TeamChip name={ma.teamName} visual={visualFor(ma.teamName)} />
                            <span className="text-[11px] tabular-nums shrink-0">
                              {fmtDelta(ma.delta, true)}
                            </span>
                          </div>
                          <div className="text-[11px] text-violet-600">
                            Manual adjustment
                            {ma.pending && (
                              <span className="ml-1.5 text-amber-600 font-semibold">
                                NOT APPLIED
                              </span>
                            )}
                            {ma.note ? (
                              <span className="text-slate-400"> {'\u00b7'} {ma.note}</span>
                            ) : null}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[11px] text-slate-400">
                            as of{' '}
                            {new Date(ma.adjustDate).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </div>
                          {ma.ratingBefore !== null && ma.ratingAfter !== null && (
                            <div className="text-xs text-slate-600 tabular-nums whitespace-nowrap">
                              {ma.ratingBefore.toFixed(2)} {'\u2192'} {ma.ratingAfter.toFixed(2)}
                            </div>
                          )}
                          <div className="text-[11px] text-slate-400">Manual</div>
                        </div>
                      </div>
                    </div>
                  );
                }
                const a = e.adj;
                return (
                  <div key={a.gameId} className="px-3 sm:px-4 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <TeamChip name={a.awayTeam} visual={visualFor(a.awayTeam)} />
                          <span className="text-[11px] tabular-nums shrink-0">
                            {fmtDelta(a.adjustment, true)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <TeamChip name={a.homeTeam} visual={visualFor(a.homeTeam)} />
                          <span className="text-[11px] tabular-nums shrink-0">
                            {fmtDelta(-a.adjustment, true)}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[11px] text-slate-400">
                          {new Date(a.gameDate).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                          {a.isNeutralSite ? ' \u00b7 N' : ''}
                        </div>
                        <div className="text-xs text-slate-600 tabular-nums whitespace-nowrap">
                          proj {a.projectedSpread.toFixed(1)} {'\u2192'} close{' '}
                          {a.closingSpread.toFixed(1)}
                        </div>
                        <div className="text-[11px] text-slate-400">{a.closingSource}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </>)}
      </div>
    </div>
  );
}
