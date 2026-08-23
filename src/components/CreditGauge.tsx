// src/components/CreditGauge.tsx
// "Fuel gauge" card for the Odds API key, shown on Bet Admin. Live counter +
// meter, burn stats, and a 30-day area chart of credits remaining with a
// crosshair tooltip. The key is shared with the kalshi-mmbot, so this is
// TOTAL burn, not just the site's.
'use client';

import { useState, useEffect, useRef, useMemo } from 'react';

interface UsagePoint {
  ts: string;
  remaining: number;
  used: number;
}
interface UsageData {
  remaining: number | null;
  used: number | null;
  planSize: number | null;
  burn24h: number | null;
  burn7d: number | null;
  perDay: number | null;
  daysLeft: number | null;
  history: UsagePoint[];
}

const ACCENT = '#0052ff';
const fmt = (n: number | null | undefined): string =>
  n === null || n === undefined ? '—' : Math.round(n).toLocaleString();

const CHART_H = 96;
const PAD_Y = 6;

export default function CreditGauge() {
  const [data, setData] = useState<UsageData | null>(null);
  const [error, setError] = useState(false);
  const [hover, setHover] = useState<{ x: number; i: number } | null>(null);
  const [width, setWidth] = useState(600);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/credit-usage')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((es) => setWidth(es[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const points = useMemo(() => {
    if (!data || data.history.length < 2) return null;
    const h = data.history;
    const t0 = new Date(h[0].ts).getTime();
    const t1 = new Date(h[h.length - 1].ts).getTime();
    const span = Math.max(1, t1 - t0);
    const max = Math.max(...h.map((p) => p.remaining));
    const min = Math.min(...h.map((p) => p.remaining));
    const range = Math.max(1, max - min);
    return h.map((p) => ({
      ...p,
      x: ((new Date(p.ts).getTime() - t0) / span) * width,
      y: PAD_Y + (1 - (p.remaining - min) / range) * (CHART_H - 2 * PAD_Y),
    }));
  }, [data, width]);

  const pct =
    data?.remaining != null && data.planSize ? data.remaining / data.planSize : null;

  const hovered = hover && points ? points[hover.i] : null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">API credits</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            The Odds API — whole key, site + weather/sports bots
          </p>
        </div>
        {data?.planSize != null && (
          <span className="text-[11px] text-slate-400 tabular-nums whitespace-nowrap">
            {fmt(data.planSize)}/mo plan
          </span>
        )}
      </div>

      {error ? (
        <p className="text-xs text-slate-500">
          Couldn&apos;t load usage — has <code className="text-[11px]">sql/odds_api_usage.sql</code> been
          run in Supabase?
        </p>
      ) : !data ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 divide-x divide-slate-100">
            <div className="pr-2">
              <div className="text-[11px] font-medium text-slate-500">Remaining</div>
              <div className="text-2xl font-bold text-slate-900 tabular-nums tracking-tight">
                {fmt(data.remaining)}
              </div>
              {pct !== null && (
                <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.max(1, pct * 100)}%`, background: ACCENT }}
                  />
                </div>
              )}
            </div>
            <div className="px-3">
              <div className="text-[11px] font-medium text-slate-500">Last 24h</div>
              <div className="text-lg font-bold text-slate-900 mt-0.5 tabular-nums tracking-tight">
                {fmt(data.burn24h)}
              </div>
              <div className="text-[11px] text-slate-400">credits burned</div>
            </div>
            <div className="px-3">
              <div className="text-[11px] font-medium text-slate-500">Per day</div>
              <div className="text-lg font-bold text-slate-900 mt-0.5 tabular-nums tracking-tight">
                {fmt(data.perDay)}
              </div>
              <div className="text-[11px] text-slate-400">7-day average</div>
            </div>
            <div className="pl-3">
              <div className="text-[11px] font-medium text-slate-500">Runway</div>
              <div className="text-lg font-bold text-slate-900 mt-0.5 tabular-nums tracking-tight">
                {data.daysLeft === null ? '—' : `${Math.round(data.daysLeft)}d`}
              </div>
              <div className="text-[11px] text-slate-400">at current burn</div>
            </div>
          </div>

          {/* Remaining-over-time area chart */}
          <div ref={wrapRef} className="relative mt-4 select-none">
            {points ? (
              <>
                <svg
                  width={width}
                  height={CHART_H}
                  className="block"
                  onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    let best = 0;
                    for (let i = 1; i < points.length; i++)
                      if (Math.abs(points[i].x - x) < Math.abs(points[best].x - x)) best = i;
                    setHover({ x: points[best].x, i: best });
                  }}
                  onMouseLeave={() => setHover(null)}
                >
                  {/* recessive grid: min/max hairlines only */}
                  <line x1={0} x2={width} y1={PAD_Y} y2={PAD_Y} stroke="#e2e8f0" strokeWidth={1} />
                  <line
                    x1={0} x2={width} y1={CHART_H - PAD_Y} y2={CHART_H - PAD_Y}
                    stroke="#e2e8f0" strokeWidth={1}
                  />
                  <path
                    d={`M ${points.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ')} L ${width} ${CHART_H - PAD_Y} L 0 ${CHART_H - PAD_Y} Z`}
                    fill={ACCENT}
                    fillOpacity={0.08}
                  />
                  <path
                    d={`M ${points.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ')}`}
                    fill="none"
                    stroke={ACCENT}
                    strokeWidth={2}
                    strokeLinejoin="round"
                  />
                  {hovered && (
                    <>
                      <line
                        x1={hovered.x} x2={hovered.x} y1={PAD_Y} y2={CHART_H - PAD_Y}
                        stroke="#94a3b8" strokeWidth={1}
                      />
                      <circle cx={hovered.x} cy={hovered.y} r={4} fill={ACCENT} stroke="#fff" strokeWidth={2} />
                    </>
                  )}
                </svg>
                {hovered && (
                  <div
                    className="absolute top-0 pointer-events-none bg-slate-900 text-white text-[11px] rounded-md px-2 py-1 whitespace-nowrap tabular-nums"
                    style={{
                      left: Math.min(Math.max(hovered.x, 60), width - 60),
                      transform: 'translateX(-50%)',
                    }}
                  >
                    {new Date(hovered.ts).toLocaleString([], {
                      month: 'short', day: 'numeric', hour: 'numeric',
                    })}{' '}
                    · {fmt(hovered.remaining)} left
                  </div>
                )}
                <div className="flex justify-between text-[10px] text-slate-400 mt-1 tabular-nums">
                  <span>
                    {new Date(points[0].ts).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </span>
                  <span className="text-slate-500">credits remaining</span>
                  <span>now</span>
                </div>
              </>
            ) : (
              <p className="text-[11px] text-slate-400">
                Collecting history — the chart appears once snapshots span a few hours.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
