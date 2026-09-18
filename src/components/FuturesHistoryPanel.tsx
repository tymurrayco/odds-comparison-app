'use client';

// src/components/FuturesHistoryPanel.tsx
// History tab shared by the FBS and NFL ratings pages: how the futures
// model and the books' prices have moved week by week. Movers table (this
// week vs last, and vs the first snapshot), group filter, tap a team for
// its per-week lines. The league passes its endpoints, the metrics to rank
// by and the columns of the per-week table.

import Link from 'next/link';
import { MouseEvent, useCallback, useEffect, useMemo, useState } from 'react';

export interface HistoryMetric { key: string; label: string; hint: string; pct: boolean }
export interface HistoryColumn {
  key: string;
  label: string;
  kind: 'pct' | 'num' | 'record' | 'proj' | 'odds' | 'market' | 'text';
}
export interface HistoryPanelConfig {
  endpoint: string;         // GET history
  snapshotEndpoint: string; // GET snapshot?force=1
  groupNoun: string;        // "conference" | "division"
  metrics: HistoryMetric[];
  columns: HistoryColumn[];
  blurb: string;
}

type Point = Record<string, unknown> & {
  week: number;
  takenAt: string | null;
  marketProb: number | null;
  marketBooks: number;
  marketBestOdds: number | null;
};
interface Team { teamName: string; group: string | null; points: Point[] }
interface HistoryResponse {
  success: boolean;
  error?: string;
  season: number;
  weeks: { week: number; takenAt: string | null; gamesStarted?: number }[];
  teams: Team[];
  rows: number;
}
interface TeamVisual { logo: string | null; color: string; href?: string | null }

const num = (v: unknown): number | null => (typeof v === 'number' ? v : typeof v === 'string' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const fmtVal = (v: number | null, pctFmt: boolean, dp = 1) => (v === null ? '—' : pctFmt ? `${(v * 100).toFixed(dp)}%` : v.toFixed(1));
const fmtDelta = (d: number | null, pctFmt: boolean) => {
  if (d === null) return '—';
  const v = pctFmt ? d * 100 : d;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}${pctFmt ? 'pp' : ''}`;
};
const fmtOdds = (o: number | null) => (o === null ? '—' : o > 0 ? `+${o}` : String(o));

// Fixed categorical order (validated palette, light surface) — a series keeps
// its colour whatever the filter shows. Slots 1–6.
const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];

// One team, every percentage category over the captured weeks. Crosshair +
// tooltip on hover, legend row below, last value labelled at the line end.
function TeamChart({ team, metrics, weeks }: { team: Team; metrics: HistoryMetric[]; weeks: number[] }) {
  const [hover, setHover] = useState<number | null>(null); // index into weeks
  const series = metrics
    .filter((m) => m.pct)
    .map((m, i) => ({
      key: m.key, label: m.label, color: SERIES_COLORS[i % SERIES_COLORS.length],
      values: weeks.map((w) => { const p = team.points.find((x) => x.week === w); return p ? num(p[m.key]) : null; }),
    }))
    .filter((s) => s.values.some((v) => v !== null));
  if (weeks.length < 2 || series.length === 0) {
    return <div className="text-[11px] text-slate-400 mb-2">Chart appears once two or more weeks are captured.</div>;
  }
  const W = 640, H = 220, L = 40, R = 118, T = 12, B = 28;
  const maxV = Math.max(0.05, ...series.flatMap((s) => s.values.filter((v): v is number => v !== null)));
  const top = Math.min(1, Math.ceil(maxV * 10) / 10 + 0.05);
  const x = (i: number) => L + (weeks.length === 1 ? 0 : (i / (weeks.length - 1)) * (W - L - R));
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top);
  // End labels: push apart so they never overlap (12px line height)
  const ends = series
    .map((s) => { const last = [...s.values].reverse().find((v) => v !== null); return last === undefined || last === null ? null : { s, v: last, y: y(last) }; })
    .filter((e): e is { s: typeof series[number]; v: number; y: number } => !!e)
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 12) ends[i].y = ends[i - 1].y + 12;
  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    for (let i = 1; i < weeks.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    setHover(best);
  };
  return (
    <div className="mb-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[640px] h-auto select-none" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={`${team.teamName} odds by week`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth={1} />
            <text x={L - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="#94a3b8">{Math.round(t * 100)}%</text>
          </g>
        ))}
        {weeks.map((w, i) => (
          <text key={w} x={x(i)} y={H - 10} textAnchor="middle" fontSize={10} fill="#94a3b8">wk {w}</text>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3" />}
        {series.map((s) => {
          const pts = s.values.map((v, i) => (v === null ? null : [x(i), y(v)] as const));
          const d = pts.map((p, i) => (p ? `${i === 0 || !pts[i - 1] ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}` : '')).join(' ');
          return (
            <g key={s.key}>
              <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {pts.map((p, i) => p && (
                <circle key={i} cx={p[0]} cy={p[1]} r={hover === i ? 4 : 2.5} fill={s.color} stroke="#fff" strokeWidth={hover === i ? 2 : 0} />
              ))}
            </g>
          );
        })}
        {ends.map((e) => (
          <text key={e.s.key} x={W - R + 6} y={e.y + 3} fontSize={10} fill="#334155">
            <tspan fill={e.s.color}>●</tspan> {e.s.label} {(e.v * 100).toFixed(0)}%
          </text>
        ))}
      </svg>
      {hover !== null && (
        <div className="text-[11px] text-slate-600 tabular-nums flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
          <span className="font-semibold text-slate-800">Week {weeks[hover]}</span>
          {series.map((s) => (
            <span key={s.key}><span style={{ color: s.color }}>●</span> {s.label} {s.values[hover] === null ? '—' : `${((s.values[hover] as number) * 100).toFixed(1)}%`}</span>
          ))}
        </div>
      )}
      <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color }} /> {s.label}</span>
        ))}
      </div>
    </div>
  );
}

function Sparkline({ values, pctFmt, weeks }: { values: (number | null)[]; pctFmt: boolean; weeks: number[] }) {
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
      <title>{pts.map((p) => `wk ${weeks[p[0]]}: ${fmtVal(p[1], pctFmt)}`).join(' · ')}</title>
    </svg>
  );
}

export default function FuturesHistoryPanel({
  config,
  visualFor,
  admin = false,
}: {
  config: HistoryPanelConfig;
  visualFor: (teamName: string) => TeamVisual;
  admin?: boolean;
}) {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<string>(config.metrics[0].key);
  const [group, setGroup] = useState('all');
  const [openTeam, setOpenTeam] = useState<string | null>(null);
  const [snapping, setSnapping] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(config.endpoint);
      const json: HistoryResponse = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [config.endpoint]);
  useEffect(() => { load(); }, [load]);

  const snapshotNow = async () => {
    setSnapping(true);
    setNote(null);
    try {
      const res = await fetch(config.snapshotEndpoint);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      const parts = Object.entries((json.written ?? {}) as Record<string, number>).map(([k, v]) => `${k} ${v}`);
      const refused: string[] = json.refused ?? [];
      if (refused.length && parts.length === 0) {
        setNote(`Week ${json.week} is locked — ${json.gamesStarted} of week ${json.nextWeek}'s games have already started, so the pre-week snapshot stays as taken. Nothing rewritten.`);
      } else {
        setNote(`Week ${json.week} captured: ${parts.join(', ')}${json.gamesStarted ? ` · taken after ${json.gamesStarted} game${json.gamesStarted === 1 ? '' : 's'} of week ${json.nextWeek} had started` : ''}${refused.length ? ` · kept (locked): ${refused.join(', ')}` : ''}${json.unmatchedMarketNames?.length ? ` · ${json.unmatchedMarketNames.length} book names unmatched` : ''}`);
      }
      await load();
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Snapshot failed');
    } finally {
      setSnapping(false);
    }
  };

  const m = config.metrics.find((x) => x.key === metric) ?? config.metrics[0];
  const weeks = useMemo(() => data?.weeks.map((w) => w.week) ?? [], [data]);
  const lastWeek = weeks.length ? weeks[weeks.length - 1] : null;
  const prevWeek = weeks.length > 1 ? weeks[weeks.length - 2] : null;
  const firstWeek = weeks.length ? weeks[0] : null;
  const groups = useMemo(() => [...new Set((data?.teams ?? []).map((t) => t.group ?? 'Other'))].sort(), [data]);

  const rows = useMemo(() => {
    if (!data || lastWeek === null) return [];
    const val = (t: Team, w: number | null): number | null => {
      if (w === null) return null;
      const p = t.points.find((x) => x.week === w);
      return p ? num(p[m.key]) : null;
    };
    return data.teams
      .filter((t) => group === 'all' || (t.group ?? 'Other') === group)
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
  }, [data, m.key, group, lastWeek, prevWeek, firstWeek, weeks]);

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

  const cell = (p: Point, c: HistoryColumn): string => {
    switch (c.kind) {
      case 'pct': return fmtVal(num(p[c.key]), true);
      case 'num': return fmtVal(num(p[c.key]), false);
      case 'record': {
        const w = num(p.wins), l = num(p.losses), t = num(p.ties);
        return w === null ? '—' : `${w}–${l}${t ? `–${t}` : ''}`;
      }
      case 'proj': {
        const w = num(p.projWins), l = num(p.projLosses);
        return w === null ? '—' : `${w.toFixed(1)}–${(l ?? 0).toFixed(1)}`;
      }
      case 'odds': return fmtOdds(num(p[c.key]));
      case 'market': return p.marketProb !== null ? `${fmtVal(p.marketProb, true)} · best ${fmtOdds(p.marketBestOdds)} (${p.marketBooks} bk)` : '—';
      case 'text': return p[c.key] === null || p[c.key] === undefined ? '—' : String(p[c.key]);
    }
  };

  const gridCols = 'sm:grid-cols-[1fr_5rem_5.5rem_5.5rem_11rem]';

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[16px] font-semibold tracking-[-0.3px] text-slate-700">History — week by week</div>
            <div className="text-xs text-slate-500 mt-0.5">{config.blurb}</div>
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
          <div className="flex flex-wrap bg-slate-200/70 rounded-full p-0.5">
            {config.metrics.map((x) => (
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
          <select value={group} onChange={(e) => setGroup(e.target.value)} className="px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 bg-white">
            <option value="all">All {config.groupNoun}s</option>
            {groups.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {data && (
            <span className="text-[11px] text-slate-400 tabular-nums ml-auto">
              {weeks.length ? `Weeks captured: ${data.weeks.map((w) => `${w.week}${w.gamesStarted ? '*' : ''}`).join(', ')}` : 'No snapshots yet'}
              {data.weeks.some((w) => w.gamesStarted) ? ' · * taken after some of the next week\'s games had started' : ''}
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
              const lw = latest ? num(latest.wins) : null;
              const lr = latest ? num(latest.rating) : null;
              return (
                <div key={t.teamName}>
                  <button
                    type="button"
                    onClick={() => setOpenTeam(isOpen ? null : t.teamName)}
                    className={`w-full text-left grid grid-cols-[1fr_auto] ${gridCols} items-center gap-2 px-3 py-2 hover:bg-slate-50/60`}
                    style={{ boxShadow: `inset 3px 0 0 ${v.color}` }}
                  >
                    <Chip name={t.teamName} sub={`${t.group ?? ''}${lw !== null ? ` · ${lw}–${num(latest.losses) ?? 0}` : ''}${lr !== null ? ` · ${lr.toFixed(1)}` : ''}`} />
                    <div className="text-right sm:hidden">
                      <div className="text-sm font-semibold tabular-nums text-slate-800">{fmtVal(now, m.pct)}</div>
                      <div className={`text-[11px] tabular-nums ${dWeek === null ? 'text-slate-400' : dWeek > 0 ? 'text-emerald-600' : dWeek < 0 ? 'text-red-600' : 'text-slate-400'}`}>{fmtDelta(dWeek, m.pct)} wk</div>
                    </div>
                    <div className="hidden sm:block text-right text-sm font-semibold tabular-nums text-slate-800">{fmtVal(now, m.pct)}</div>
                    <div className={`hidden sm:block text-right text-sm tabular-nums ${dWeek === null ? 'text-slate-400' : dWeek > 0 ? 'text-emerald-600' : dWeek < 0 ? 'text-red-600' : 'text-slate-500'}`}>{fmtDelta(dWeek, m.pct)}</div>
                    <div className={`hidden sm:block text-right text-sm tabular-nums ${dSeason === null ? 'text-slate-400' : dSeason > 0 ? 'text-emerald-600' : dSeason < 0 ? 'text-red-600' : 'text-slate-500'}`}>{fmtDelta(dSeason, m.pct)}</div>
                    <div className="hidden sm:flex justify-end"><Sparkline values={series} pctFmt={m.pct} weeks={weeks} /></div>
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 pt-2 bg-slate-50/60 overflow-x-auto">
                      <TeamChart team={t} metrics={config.metrics} weeks={weeks} />
                      <table className="text-xs tabular-nums">
                        <thead>
                          <tr className="text-left text-slate-400 uppercase tracking-wide">
                            <th className="py-1 pr-3">Wk</th>
                            <th className="py-1 pr-3">Taken</th>
                            {config.columns.map((c) => <th key={c.key} className="py-1 pr-3 text-right">{c.label}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {t.points.map((p) => (
                            <tr key={p.week} className="border-t border-slate-200/70">
                              <td className="py-1 pr-3 font-medium">{p.week}</td>
                              <td className="py-1 pr-3 text-slate-500">{p.takenAt ? new Date(p.takenAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}</td>
                              {config.columns.map((c) => <td key={c.key} className="py-1 pr-3 text-right">{cell(p, c)}</td>)}
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
