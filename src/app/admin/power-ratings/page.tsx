'use client';

// src/app/admin/power-ratings/page.tsx
// Admin: view + import NCAAF power rating sets (Brad Powers etc.)

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PowerRatingSet, parseRatingsPaste } from '@/lib/powerRatings';

type SortKey = 'rank' | 'thisYr' | 'lastYr' | 'diff';

const fieldCls =
  'w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent';
const labelCls = 'block text-xs font-medium text-slate-500 mb-1';

function diffOf(r: { thisYr: number; lastYr: number | null }): number | null {
  return r.lastYr === null ? null : Math.round((r.thisYr - r.lastYr) * 100) / 100;
}

export default function PowerRatingsAdminPage() {
  const router = useRouter();

  const [sets, setSets] = useState<PowerRatingSet[]>([]);
  const [activeSetId, setActiveSetId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [confFilter, setConfFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortDesc, setSortDesc] = useState(false);

  const [showImport, setShowImport] = useState(false);
  const [importLabel, setImportLabel] = useState('');
  const [importSeason, setImportSeason] = useState('2026');
  const [importAsOf, setImportAsOf] = useState('');
  const [importText, setImportText] = useState('');
  const [saving, setSaving] = useState(false);

  const loadSets = useCallback(async (selectId?: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/power-ratings');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      const fetched: PowerRatingSet[] = json.sets;
      setSets(fetched);
      setActiveSetId((prev) => {
        const target = selectId ?? prev;
        if (target !== null && fetched.some((s) => s.id === target)) return target;
        return fetched[0]?.id ?? null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load rating sets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSets();
  }, [loadSets]);

  const activeSet = sets.find((s) => s.id === activeSetId) ?? null;

  const conferences = useMemo(() => {
    if (!activeSet) return [];
    return Array.from(new Set(activeSet.ratings.map((r) => r.conference).filter((c): c is string => !!c))).sort();
  }, [activeSet]);

  const displayRows = useMemo(() => {
    if (!activeSet) return [];
    let rows = activeSet.ratings.slice();
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((r) => r.team.toLowerCase().includes(q));
    }
    if (confFilter !== 'all') rows = rows.filter((r) => r.conference === confFilter);
    rows.sort((a, b) => {
      let av: number | null, bv: number | null;
      if (sortKey === 'diff') { av = diffOf(a); bv = diffOf(b); }
      else { av = a[sortKey]; bv = b[sortKey]; }
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return sortDesc ? bv - av : av - bv;
    });
    return rows;
  }, [activeSet, search, confFilter, sortKey, sortDesc]);

  const importPreview = useMemo(() => {
    if (!importText.trim()) return null;
    return parseRatingsPaste(importText);
  }, [importText]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDesc(!sortDesc);
    else {
      setSortKey(key);
      setSortDesc(key !== 'rank');
    }
  };

  const handleImport = async () => {
    if (!importPreview || !importPreview.rows.length) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/power-ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceLabel: importLabel,
          season: Number(importSeason),
          asOf: importAsOf || null,
          ratings: importPreview.rows,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setMessage(`Saved "${importLabel}" ${importSeason} (${importPreview.rows.length} teams)`);
      setShowImport(false);
      setImportText('');
      await loadSets(json.set.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!activeSet) return;
    if (!window.confirm(`Delete "${activeSet.source_label}" ${activeSet.season} (${activeSet.ratings.length} teams)?`)) return;
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/power-ratings?id=${activeSet.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setMessage(`Deleted "${activeSet.source_label}" ${activeSet.season}`);
      setActiveSetId(null);
      await loadSets();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Power Ratings</h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">NCAAF rating sets by source</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => router.push('/admin/bets')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition"
              >
                Bet Admin
              </button>
              <button
                onClick={() => router.push('/')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
        {message && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">{message}</div>}

        {/* Set picker + actions */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className={labelCls}>Rating Set</label>
            <select
              value={activeSetId ?? ''}
              onChange={(e) => setActiveSetId(Number(e.target.value))}
              className={fieldCls}
            >
              {sets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.source_label} — {s.season} ({s.ratings.length} teams)
                </option>
              ))}
              {!sets.length && <option value="">No sets yet</option>}
            </select>
          </div>
          <button
            onClick={() => setShowImport(!showImport)}
            className="px-3 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition"
          >
            {showImport ? 'Close Import' : '+ Import Set'}
          </button>
          {activeSet && (
            <button
              onClick={handleDelete}
              className="px-3 py-2 text-sm font-medium rounded-lg bg-white border border-red-200 text-red-600 hover:bg-red-50 transition"
            >
              Delete
            </button>
          )}
          {activeSet && (
            <div className="w-full text-xs text-slate-400">
              {activeSet.as_of && <>As of {activeSet.as_of} · </>}
              Updated {new Date(activeSet.updated_at).toLocaleDateString()}
            </div>
          )}
        </div>

        {/* Import panel */}
        {showImport && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Source Label</label>
                <input value={importLabel} onChange={(e) => setImportLabel(e.target.value)} placeholder="Brad Powers" className={fieldCls} />
              </div>
              <div>
                <label className={labelCls}>Season</label>
                <input value={importSeason} onChange={(e) => setImportSeason(e.target.value)} inputMode="numeric" className={fieldCls} />
              </div>
              <div>
                <label className={labelCls}>As Of (optional)</label>
                <input type="date" value={importAsOf} onChange={(e) => setImportAsOf(e.target.value)} className={fieldCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>
                Ratings — one team per line, comma or tab separated: <span className="font-mono">Team, Rating [, LastYr] [, Conference]</span> (header row optional)
              </label>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={8}
                placeholder={'Ohio State, 93.58, 92.65, Big Ten\nNotre Dame, 92.81, 92.28, Independent'}
                className={`${fieldCls} font-mono text-xs`}
              />
            </div>
            {importPreview && (
              <div className="text-xs">
                <span className="text-slate-600">Parsed {importPreview.rows.length} teams.</span>
                {importPreview.errors.length > 0 && (
                  <span className="text-red-600"> {importPreview.errors.length} issue(s): {importPreview.errors.slice(0, 3).join('; ')}</span>
                )}
              </div>
            )}
            <div className="text-xs text-slate-400">
              Importing with an existing label + season replaces that set.
            </div>
            <button
              onClick={handleImport}
              disabled={saving || !importLabel.trim() || !importPreview?.rows.length}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {saving ? 'Saving…' : 'Save Set'}
            </button>
          </div>
        )}

        {/* Filters */}
        {activeSet && (
          <div className="flex flex-wrap gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search teams…"
              className={`${fieldCls} !w-auto flex-1 min-w-[140px]`}
            />
            <select value={confFilter} onChange={(e) => setConfFilter(e.target.value)} className={`${fieldCls} !w-auto`}>
              <option value="all">All Conferences</option>
              {conferences.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        )}

        {/* Ratings table */}
        {loading ? (
          <div className="text-sm text-slate-500 py-8 text-center">Loading…</div>
        ) : !activeSet ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center text-sm text-slate-500">
            No rating sets yet. Import one above, or run the seed SQL to load Brad Powers 2026.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <th className="px-3 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('rank')}>
                    Rk{sortKey === 'rank' && (sortDesc ? ' ↓' : ' ↑')}
                  </th>
                  <th className="px-3 py-2.5">Team</th>
                  <th className="px-3 py-2.5 hidden sm:table-cell">Conf</th>
                  <th className="px-3 py-2.5 text-right cursor-pointer select-none" onClick={() => toggleSort('thisYr')}>
                    Rating{sortKey === 'thisYr' && (sortDesc ? ' ↓' : ' ↑')}
                  </th>
                  <th className="px-3 py-2.5 text-right cursor-pointer select-none" onClick={() => toggleSort('lastYr')}>
                    Last Yr{sortKey === 'lastYr' && (sortDesc ? ' ↓' : ' ↑')}
                  </th>
                  <th className="px-3 py-2.5 text-right cursor-pointer select-none" onClick={() => toggleSort('diff')}>
                    Diff{sortKey === 'diff' && (sortDesc ? ' ↓' : ' ↑')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((r) => {
                  const diff = diffOf(r);
                  return (
                    <tr key={r.team} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-400 tabular-nums">{r.rank}</td>
                      <td className="px-3 py-2 font-medium">
                        {r.team}
                        {r.conference && <span className="sm:hidden text-xs text-slate-400 font-normal"> · {r.conference}</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-500 hidden sm:table-cell">{r.conference ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.thisYr.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.lastYr?.toFixed(2) ?? '—'}</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-medium ${
                        diff === null ? 'text-slate-400' : diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-600' : 'text-slate-500'
                      }`}>
                        {diff === null ? '—' : `${diff > 0 ? '+' : ''}${diff.toFixed(2)}`}
                      </td>
                    </tr>
                  );
                })}
                {!displayRows.length && (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">No teams match</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
