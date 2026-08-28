'use client';

// src/app/admin/fcs-ratings/page.tsx
// Admin: FCS market-driven power ratings.
// Seeded from Massey FCS Pwr, adjusted by closing lines (half-the-difference,
// zero-sum). Massey seed + game sync are run from here (locally — the Massey
// scrape needs puppeteer, same as KenPom).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FcsClosingLine, FcsGameAdjustment, FcsTeamRating } from '@/lib/fcs/types';

const thCls =
  'sticky top-0 z-10 bg-white px-3 py-2.5 cursor-pointer select-none text-left text-xs font-semibold text-slate-500 shadow-[inset_0_-1px_0_#e2e8f0]';
const tdCls = 'px-3 py-2 text-sm text-slate-700 whitespace-nowrap';
const btnCls =
  'px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed';
const primaryBtnCls =
  'px-4 py-2 text-sm font-medium rounded-lg bg-[#0052ff] text-white hover:bg-[#0043d1] disabled:opacity-50 disabled:cursor-not-allowed';

type SortKey = 'rating' | 'team' | 'conference' | 'delta' | 'games';

interface RatingsResponse {
  success: boolean;
  season: number;
  ratings: FcsTeamRating[];
  adjustments: FcsGameAdjustment[];
  totalAdjustments: number;
  unlinedGames: FcsClosingLine[];
  error?: string;
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
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : `${label} failed`);
    } finally {
      setBusy(null);
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
        case 'conference':
          return dir * (a.conference ?? '').localeCompare(b.conference ?? '');
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
      setSortDesc(key !== 'team' && key !== 'conference');
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
      setError(e instanceof Error ? e.message : 'Failed to save line');
    } finally {
      setSavingLine(null);
    }
  };

  const fmtDelta = (r: FcsTeamRating) => {
    const d = Math.round((r.rating - r.initialRating) * 100) / 100;
    if (d === 0) return <span className="text-slate-400">0.00</span>;
    return (
      <span className={d > 0 ? 'text-emerald-600' : 'text-red-600'}>
        {d > 0 ? '+' : ''}
        {d.toFixed(2)}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800">FCS Power Ratings</h1>
            <p className="text-sm text-slate-500">
              Massey seed → market-adjusted by closing lines · {data?.totalAdjustments ?? 0}{' '}
              games processed · season {data?.season ?? ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className={btnCls}
              disabled={busy !== null}
              onClick={() =>
                runAction('seed', '/api/fcs/massey-sync', {},
                  data && data.ratings.length > 0
                    ? 'Ratings already exist. This refreshes metadata (HFA/conference) without touching adjusted ratings. Continue?'
                    : undefined
                )
              }
            >
              {busy === 'seed' ? 'Scraping Massey…' : 'Seed from Massey'}
            </button>
            <button
              className={primaryBtnCls}
              disabled={busy !== null || (data?.ratings.length ?? 0) === 0}
              onClick={() => runAction('sync', '/api/fcs/calculate', { action: 'sync' })}
            >
              {busy === 'sync' ? 'Syncing…' : 'Sync Games'}
            </button>
            <button
              className={btnCls}
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
              {busy === 'recalc' ? 'Recalculating…' : 'Recalculate All'}
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

        <div className="flex flex-wrap gap-2">
          <input
            className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0052ff]/25"
            placeholder="Search team…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
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

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={thCls}>#</th>
                  <th className={thCls} onClick={() => setSort('team')}>Team</th>
                  <th className={thCls} onClick={() => setSort('conference')}>Conf</th>
                  <th className={thCls} onClick={() => setSort('rating')}>Rating</th>
                  <th className={thCls}>Seed (Massey)</th>
                  <th className={thCls} onClick={() => setSort('delta')}>Δ Market</th>
                  <th className={thCls}>HFA</th>
                  <th className={thCls} onClick={() => setSort('games')}>Games</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td className={tdCls} colSpan={8}>Loading…</td></tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td className={tdCls} colSpan={8}>
                      No ratings yet — run &quot;Seed from Massey&quot; (requires the SQL in
                      sql/fcs_ratings.sql to be applied, and a local dev server for puppeteer).
                    </td>
                  </tr>
                ) : (
                  rows.map((r, i) => (
                    <tr key={r.teamName} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className={`${tdCls} text-slate-400`}>{i + 1}</td>
                      <td className={`${tdCls} font-medium text-slate-800`}>
                        {r.teamName}
                        {!r.espnName && (
                          <span
                            className="ml-1.5 text-amber-500"
                            title="No ESPN link — games for this team will be skipped. Add an override in src/lib/fcs/teamNames.ts and re-seed."
                          >
                            ⚠
                          </span>
                        )}
                      </td>
                      <td className={`${tdCls} text-slate-500`}>{r.conference}</td>
                      <td className={`${tdCls} font-semibold`}>{r.rating.toFixed(2)}</td>
                      <td className={`${tdCls} text-slate-500`}>{r.initialRating.toFixed(2)}</td>
                      <td className={tdCls}>{fmtDelta(r)}</td>
                      <td className={`${tdCls} text-slate-500`}>{r.hfa?.toFixed(2) ?? '—'}</td>
                      <td className={`${tdCls} text-slate-500`}>{r.gamesProcessed}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {(data?.unlinedGames ?? []).length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <div className="text-sm font-semibold text-slate-700">
                Games missing a closing line ({data!.unlinedGames.length})
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                The Odds API had no line for these. Enter the closing spread from the home
                team&apos;s perspective (negative = home favored), then Sync Games to apply.
              </div>
            </div>
            <div className="overflow-x-auto max-h-[40vh] overflow-y-auto">
              <table className="w-full">
                <tbody>
                  {data!.unlinedGames.map((g) => (
                    <tr key={g.gameId} className="border-t border-slate-100">
                      <td className={`${tdCls} text-slate-500`}>
                        {g.gameDate?.substring(0, 10)}
                      </td>
                      <td className={tdCls}>
                        {g.awayTeam} @ {g.homeTeam}
                        {g.isNeutralSite && (
                          <span className="ml-1.5 text-xs text-slate-400">(N)</span>
                        )}
                      </td>
                      <td className={tdCls}>
                        <input
                          type="text"
                          autoComplete="off"
                          autoCorrect="off"
                          className="w-24 px-2 py-1 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0052ff]/25"
                          placeholder="-6.5"
                          value={manualSpreads[g.gameId] ?? ''}
                          onChange={(e) =>
                            setManualSpreads((m) => ({ ...m, [g.gameId]: e.target.value }))
                          }
                        />
                      </td>
                      <td className={tdCls}>
                        <button
                          className={btnCls}
                          disabled={savingLine !== null || !(manualSpreads[g.gameId] ?? '').trim()}
                          onClick={() => saveManualLine(g.gameId)}
                        >
                          {savingLine === g.gameId ? 'Saving…' : 'Save'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 text-sm font-semibold text-slate-700">
            Recent adjustments
          </div>
          <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={thCls}>Date</th>
                  <th className={thCls}>Matchup</th>
                  <th className={thCls}>Projected</th>
                  <th className={thCls}>Closing</th>
                  <th className={thCls}>Diff</th>
                  <th className={thCls}>Adj (away / home)</th>
                </tr>
              </thead>
              <tbody>
                {(data?.adjustments ?? []).map((a) => (
                  <tr key={a.gameId} className="border-t border-slate-100">
                    <td className={`${tdCls} text-slate-500`}>
                      {a.gameDate.substring(0, 10)}
                    </td>
                    <td className={tdCls}>
                      {a.awayTeam} @ {a.homeTeam}
                      {a.isNeutralSite && (
                        <span className="ml-1.5 text-xs text-slate-400">(N)</span>
                      )}
                    </td>
                    <td className={tdCls}>{a.projectedSpread.toFixed(1)}</td>
                    <td className={tdCls}>{a.closingSpread.toFixed(1)}</td>
                    <td className={tdCls}>{a.difference.toFixed(2)}</td>
                    <td className={tdCls}>
                      <span className={a.adjustment >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                        {a.adjustment >= 0 ? '+' : ''}
                        {a.adjustment.toFixed(2)}
                      </span>
                      {' / '}
                      <span className={-a.adjustment >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                        {-a.adjustment >= 0 ? '+' : ''}
                        {(-a.adjustment).toFixed(2)}
                      </span>
                    </td>
                  </tr>
                ))}
                {(data?.adjustments ?? []).length === 0 && !loading && (
                  <tr>
                    <td className={tdCls} colSpan={6}>
                      No games processed yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
