'use client';

// src/components/FbsHistoryPanel.tsx
// History tab on the FBS ratings pages: how the futures model, the G5
// playoff sim and the books' national-title prices have moved week by
// week. Movers table (this week vs last, and vs the first snapshot),
// conference filter, tap a team for its lines. Data from /api/fbs/history,
// captured weekly by /api/fbs/snapshot (Vercel cron) or the admin button.

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TeamVisual } from './FbsFuturesPanel';

interface Point {
  week: number;
  takenAt: string | null;
  rating: number | null;
  wins: number | null;
  losses: number | null;
  projWins: number | null;
  projLosses: number | null;
  titleProb: number | null;
  ccgProb: number | null;
  top2Prob: number | null;
  champProb: number | null;
  playoffProb: number | null;
  fairOdds: number | null;
  timing: string | null;
  marketProb: number | null;
  marketBooks: number;
  marketBestOdds: number | null;
}
interface Team { teamName: string; conference: string | null; inG5: boolean; points: Point[] }
interface HistoryResponse {
  success: boolean;
  error?: string;
  season: number;
  weeks: { week: number; takenAt: string | null }[];
  teams: Team[];
  rows: number;
}

type Metric = 'titleProb' | 'playoffProb' | 'marketProb' | 'rating';
const METRICS: { key: Metric; label: string; hint: string; pct: boolean }[] = [
  { key: 'titleProb', label: 'Conference title', hint: 'Model: regular-season conference title', pct: true },
  { key: 'playoffProb', label: 'G5 playoff', hint: 'Model: takes the Group of Five playoff spot', pct: true },
  { key: 'marketProb', label: 'National title (books)', hint: 'Books: national-title outright, hold removed, median of books', pct: true },
  { key: 'rating', label: 'Rating', hint: 'Ledger rating', pct: false },
];

const fmtVal = (v: number | null, pctFmt: boolean, dp = 1) => (v === null ? '—' : pctFmt ? `${(v * 100).toFixed(dp)}%` : v.toFixed(1));
const fmtDelta = (d: number | null, pctFmt: boolean) => {
  if (d === null) return '—';
  const v = pctFmt ? d * 100 : d;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}${pctFmt ? 'pp' : ''}`;
};
const fmtOdds = (o: number | null) => (o === null ? '—' : o > 0 ? `+${o}` : String(o));

function Sparkline({ values, pctFmt }: { values: (number | null)[]; pctFmt: boolean }) {
  const pts = values.map((v, i) => [i, v] as const).filter((x): x is readonly [number, number] => x[1] !== null);
  if (pts.length < 2) return <span className="text-[11px] text-slate-400">need 2+ weeks</span>;
  const w = 160, h = 40, pad = 3;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const sx = (x: number) => pad + ((x - minX) / Math.max(1, maxX - minX)) * (w - 2 * pad);
  const sy = (y: number) => h - pad - ((y - minY) / Math.max(1e-9, maxY - minY)) * (h - 2 * pad);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  const up = last[1] >= pts[0][1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-label="trend">
      <path d={d} fill="none" stroke={up ? '#059669' : '#dc2626'} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={sx(last[0])} cy={sy(last[1])} r={2.5} fill={up ? '#059669' : '#dc2626'} />
      <title>{pts.map((p) => `wk${values.length ? p[0] : ''}: ${fmtVal(p[1], pctFmt)}`).join(' · ')}</title>
    </svg>
  );
}

export default function FbsHistoryPanel({ visualFor, admin = false }: { visualFor: (teamName: string) => TeamVisual; admin?: boolean }) {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>('titleProb');
  const [conf, setConf] = useState('all');
  const [openTeam, setOpenTeam] = useState<string | null>(null);
  const [snapping, setSnapping] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/fbs/history');
      const json: HistoryResponse = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const snapshotNow = async () => {
    setSnapping(true);
    setNote(null);
    try {
      const res = await fetch('/api/fbs/snapshot?force=1');
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      const parts = Object.entries(json.written as Record<string, number>).map(([k, v]) => `${k} ${v}`);
      setNote(`Week ${json.week} captured: ${parts.join(', ')}${json.unmatchedMarketNames?.length ? ` · ${json.unmatchedMarketNames.length} book names unmatched` : ''}`);
      await load();
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Snapshot failed');
    } finally {
      setSnapping(false);
    }
  };

  const m = METRICS.find((x) => x.key === metric)!;
  const weeks = data?.weeks.map((w) => w.week) ?? [];
  const lastWeek = weeks.length ? weeks[weeks.length - 1] : null;
  const prevWeek = weeks.length > 1 ? weeks[weeks.length - 2] : null;
  const firstWeek = weeks.length ? weeks[0] : null;

  const conferences = useMemo(() => [...new Set((data?.teams ?? []).map((t) => t.conference ?? 'Independent'))].sort(), [data]);

  const rows = useMemo(() => {
    if (!data || lastWeek === null) return [];
    const val = (t: Team, w: number | null): number | null => {
      if (w === null) return null;
      const p = t.points.find((x) => x.week === w);
      const v = p ? p[metric] : null;
      return typeof v === 'number' ? v : null;
    };
    return data.teams
      .filter((t) => conf === 'all' || (t.conference ?? 'Independent') === conf)
      .filter((t) => metric !== 'playoffProb' || t.inG5)
      .map((t) => {
        const now = val(t, lastWeek);
        const prev = val(t, prevWeek);
        const first = val(t, firstWeek);
        return {
          t,
          now,
          dWeek: now !== null && prev !== null ? now - prev : null,
          dSeason: now !== null && first !== null && firstWeek !== lastWeek ? now - first : null,
          series: weeks.map((w) => val(t, w)),
        };
      })
      .filter((r) => r.now !== null || r.series.some((v) => v !== null))
      .sort((a, b) => Math.abs(b.dWeek ?? b.dSeason ?? 0) - Math.abs(a.dWeek ?? a.dSeason ?? 0) || (b.now ?? 0) - (a.now ?? 0));
  }, [data, metric, conf, lastWeek, prevWeek, firstWeek, weeks]);

  const Chip = ({ name, sub }: { name: string; sub?: string }) => {
    const v = visualFor(name);
    const inner = (
      <>
        {v.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={v.logo} alt="" className="w-6 h-6 object-contain shrink-0" loading="lazy" />
        ) : (
          <span className="w-6 h-6 rounded-full shrink-0" style={{ backgroundColor: `${v.color}33` }} />
        )}
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-800 truncate group-hover/team:underline">{name}</div>
          {sub ? <div className="text-[11px] text-slate-400 truncate tabular-nums">{sub}</div> : null}
        </div>
      </>
    );
    return v.href ? (
      <Link href={v.href} onClick={(e) => e.stopPropagation()} className="group/team flex items-center gap-2 min-w-0" title={`${name} — team page`}>{inner}</Link>
    ) : (
      <div className="flex items-center gap-2 min-w-0">{inner}</div>
    );
  };

  const gridCols = 'sm:grid-cols-[1fr_5rem_5.5rem_5.5rem_11rem]';

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[16px] font-semibold tracking-[-0.3px] text-slate-700">History — week by week</div>
            <div className="text-xs text-slate-500 mt-0.5">
              A snapshot of the futures model, the G5 sim and the books&apos; national-title prices is stored once a week after
              the games land. Biggest movers first. Conference and G5 numbers are ours only — the books don&apos;t post those
              markets.
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {admin && (
              <button
                className="px-3 py-2 text-sm font-medium rounded-lg bg-[#0052ff] text-white hover:bg-[#0043d6] disabled:opacity-50"
                disabled={snapping}
                onClick={snapshotNow}
                title="Capture this week's numbers now (rewrites this week's rows)"
              >
                {snapping ? 'Capturing…' : 'Snapshot now'}
              </button>
            )}
            <button className="px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50" disabled={loading} onClick={load}>
              {loading ? '…' : 'Refresh'}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-slate-200/70 rounded-full p-0.5">
            {METRICS.map((x) => (
              <button
                key={x.key}
                type="button"
                title={x.hint}
                onClick={() => setMetric(x.key)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${metric === x.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
              >
                {x.label}
              </button>
            ))}
          </div>
          <select value={conf} onChange={(e) => setConf(e.target.value)} className="px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 bg-white">
            <option value="all">All conferences</option>
            {conferences.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {data && (
            <span className="text-[11px] text-slate-400 tabular-nums ml-auto">
              {weeks.length ? `Weeks captured: ${weeks.join(', ')}` : 'No snapshots yet'}
              {lastWeek !== null && data.weeks[data.weeks.length - 1].takenAt ? ` · latest ${new Date(data.weeks[data.weeks.length - 1].takenAt as string).toLocaleDateString()}` : ''}
            </span>
          )}
        </div>
        {note && <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-700">{note}</div>}
        {error && <div className="p-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
      </div>

      {loading && !data ? (
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-6 text-sm text-slate-500">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-6 text-sm text-slate-500">
          {weeks.length ? 'Nothing to show for this view.' : 'No snapshots yet. The cron captures one each week; admins can take one now.'}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className={`hidden sm:grid ${gridCols} items-center px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide bg-slate-50`}>
            <div>Team</div>
            <div className="text-right" title={m.hint}>Wk {lastWeek}</div>
            <div className="text-right" title="Change since the previous snapshot">vs wk {prevWeek ?? '—'}</div>
            <div className="text-right" title="Change since the first snapshot">vs wk {firstWeek}</div>
            <div className="text-right">Trend</div>
          </div>
          <div className="divide-y divide-slate-100">
            {rows.map(({ t, now, dWeek, dSeason, series }) => {
              const v = visualFor(t.teamName);
              const isOpen = openTeam === t.teamName;
              const latest = t.points[t.points.length - 1];
              return (
                <div key={t.teamName}>
                  <button
                    type="button"
                    onClick={() => setOpenTeam(isOpen ? null : t.teamName)}
                    className={`w-full text-left grid grid-cols-[1fr_auto] ${gridCols} items-center gap-2 px-3 py-2 hover:bg-slate-50/60`}
                    style={{ boxShadow: `inset 3px 0 0 ${v.color}` }}
                  >
                    <Chip name={t.teamName} sub={`${t.conference ?? 'Independent'}${latest?.wins !== null && latest?.wins !== undefined ? ` · ${latest.wins}–${latest.losses}` : ''}${latest?.rating !== null && latest?.rating !== undefined ? ` · ${Number(latest.rating).toFixed(1)}` : ''}`} />
                    <div className="text-right sm:hidden">
                      <div className="text-sm font-semibold tabular-nums text-slate-800">{fmtVal(now, m.pct)}</div>
                      <div className={`text-[11px] tabular-nums ${dWeek === null ? 'text-slate-400' : dWeek > 0 ? 'text-emerald-600' : dWeek < 0 ? 'text-red-600' : 'text-slate-400'}`}>{fmtDelta(dWeek, m.pct)} wk</div>
                    </div>
                    <div className="hidden sm:block text-right text-sm font-semibold tabular-nums text-slate-800">{fmtVal(now, m.pct)}</div>
                    <div className={`hidden sm:block text-right text-sm tabular-nums ${dWeek === null ? 'text-slate-400' : dWeek > 0 ? 'text-emerald-600' : dWeek < 0 ? 'text-red-600' : 'text-slate-500'}`}>{fmtDelta(dWeek, m.pct)}</div>
                    <div className={`hidden sm:block text-right text-sm tabular-nums ${dSeason === null ? 'text-slate-400' : dSeason > 0 ? 'text-emerald-600' : dSeason < 0 ? 'text-red-600' : 'text-slate-500'}`}>{fmtDelta(dSeason, m.pct)}</div>
                    <div className="hidden sm:flex justify-end"><Sparkline values={series} pctFmt={m.pct} /></div>
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 pt-1 bg-slate-50/60 overflow-x-auto">
                      <table className="text-xs tabular-nums">
                        <thead>
                          <tr className="text-left text-slate-400 uppercase tracking-wide">
                            <th className="py-1 pr-3">Wk</th>
                            <th className="py-1 pr-3">Taken</th>
                            <th className="py-1 pr-3 text-right">Rec</th>
                            <th className="py-1 pr-3 text-right">Rating</th>
                            <th className="py-1 pr-3 text-right">Proj</th>
                            <th className="py-1 pr-3 text-right">Conf title</th>
                            <th className="py-1 pr-3 text-right">Title game</th>
                            {t.inG5 && <th className="py-1 pr-3 text-right">G5 playoff</th>}
                            <th className="py-1 pr-3 text-right">Fair</th>
                            <th className="py-1 pr-3 text-right">Books: natl title</th>
                            <th className="py-1 text-right">Timing</th>
                          </tr>
                        </thead>
                        <tbody>
                          {t.points.map((p) => (
                            <tr key={p.week} className="border-t border-slate-200/70">
                              <td className="py-1 pr-3 font-medium">{p.week}</td>
                              <td className="py-1 pr-3 text-slate-500">{p.takenAt ? new Date(p.takenAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}</td>
                              <td className="py-1 pr-3 text-right">{p.wins !== null ? `${p.wins}–${p.losses}` : '—'}</td>
                              <td className="py-1 pr-3 text-right">{fmtVal(p.rating, false)}</td>
                              <td className="py-1 pr-3 text-right">{p.projWins !== null ? `${Number(p.projWins).toFixed(1)}–${Number(p.projLosses).toFixed(1)}` : '—'}</td>
                              <td className="py-1 pr-3 text-right">{fmtVal(p.titleProb, true)}</td>
                              <td className="py-1 pr-3 text-right">{fmtVal(p.ccgProb, true)}</td>
                              {t.inG5 && <td className="py-1 pr-3 text-right">{fmtVal(p.playoffProb, true)}</td>}
                              <td className="py-1 pr-3 text-right">{fmtOdds(p.fairOdds)}</td>
                              <td className="py-1 pr-3 text-right">{p.marketProb !== null ? `${fmtVal(p.marketProb, true)} · best ${fmtOdds(p.marketBestOdds)} (${p.marketBooks} bk)` : '—'}</td>
                              <td className="py-1 text-right text-slate-500">{p.timing ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
