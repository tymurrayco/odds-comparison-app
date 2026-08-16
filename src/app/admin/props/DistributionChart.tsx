'use client';

// src/app/admin/props/DistributionChart.tsx
// Distribution picture for the prop pricer: histogram of actual game values
// (density-normalized) + normal and lognormal curves from the current
// projection/SD, with the betting line and the P(over) tail shaded.
// Scrub (mouse or touch-drag) to read P(over x) at any line.

import { useEffect, useMemo, useRef, useState } from 'react';
import { lognormalParams } from '@/lib/props/engine';
import { Distribution } from '@/lib/props/markets';

const COLOR_NORMAL = '#0052ff';   // validated pair: ΔE(CVD) 33.9 on white
const COLOR_LOGNORMAL = '#e8590c';
const INK_MUTED = '#94a3b8';
const INK = '#334155';

interface Props {
  values: number[];          // measured per-game stat values
  mean: number;              // current projection
  sd: number;                // current SD choice
  line: number | null;       // betting line marker
  dist: Distribution;        // active (emphasized) curve
  unit: string;              // e.g. "yds"
}

const normPdf = (x: number, m: number, s: number) =>
  Math.exp(-((x - m) * (x - m)) / (2 * s * s)) / (s * Math.sqrt(2 * Math.PI));

const logPdf = (x: number, mu: number, sigma: number) =>
  x <= 0 ? 0 : Math.exp(-((Math.log(x) - mu) ** 2) / (2 * sigma * sigma)) / (x * sigma * Math.sqrt(2 * Math.PI));

const normSf = (z: number) => {
  // 1 − Φ(z), same approximation as the engine
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? p : 1 - p;
};

function niceStep(rough: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const r = rough / mag;
  return (r >= 5 ? 10 : r >= 2 ? 5 : r >= 1 ? 2 : 1) * mag;
}

export default function DistributionChart({ values, mean, sd, line, dist, unit }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hoverX, setHoverX] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 230;
  const M = { top: 16, right: 10, bottom: 26, left: 10 };

  const model = useMemo(() => {
    if (!(mean > 0) || !(sd > 0) || width < 100) return null;
    const { mu, sigma } = lognormalParams(mean, sd);

    const maxVal = values.length ? Math.max(...values) : mean;
    const lo = Math.max(0, mean - 3.5 * sd);
    const hi = Math.max(mean + 3.5 * sd, maxVal * 1.05, (line ?? 0) * 1.08);

    const x = (v: number) => M.left + ((v - lo) / (hi - lo)) * (width - M.left - M.right);

    // Histogram: ~10 bins across the data range, density-normalized
    let bars: { x0: number; x1: number; d: number; n: number }[] = [];
    if (values.length >= 4) {
      const binW = niceStep((hi - lo) / 10);
      const start = Math.floor(lo / binW) * binW;
      const counts = new Map<number, number>();
      for (const v of values) {
        const b = Math.floor((v - start) / binW);
        counts.set(b, (counts.get(b) ?? 0) + 1);
      }
      bars = Array.from(counts.entries()).map(([b, n]) => ({
        x0: start + b * binW,
        x1: start + (b + 1) * binW,
        d: n / (values.length * binW),
        n,
      }));
    }

    // Curves sampled across the domain
    const N = 140;
    const xs: number[] = Array.from({ length: N + 1 }, (_, i) => lo + ((hi - lo) * i) / N);
    const normYs = xs.map((v) => normPdf(v, mean, sd));
    const logYs = xs.map((v) => logPdf(v, mu, sigma));

    const yMax = Math.max(...normYs, ...logYs, ...bars.map((b) => b.d)) * 1.12;
    const y = (d: number) => M.top + (1 - d / yMax) * (H - M.top - M.bottom);

    const path = (ys: number[]) =>
      xs.map((v, i) => `${i ? 'L' : 'M'}${x(v).toFixed(1)},${y(ys[i]).toFixed(1)}`).join('');

    // Shaded tail under the ACTIVE curve beyond the line
    let tail = '';
    if (line !== null && line > lo && line < hi) {
      const activeYs = dist === 'normal' ? normYs : logYs;
      const from = xs.findIndex((v) => v >= line);
      if (from > 0) {
        const pdfAtLine = dist === 'normal' ? normPdf(line, mean, sd) : logPdf(line, mu, sigma);
        const pts = [`M${x(line).toFixed(1)},${y(0).toFixed(1)}`, `L${x(line).toFixed(1)},${y(pdfAtLine).toFixed(1)}`];
        for (let i = from; i < xs.length; i++) pts.push(`L${x(xs[i]).toFixed(1)},${y(activeYs[i]).toFixed(1)}`);
        pts.push(`L${x(hi).toFixed(1)},${y(0).toFixed(1)}Z`);
        tail = pts.join('');
      }
    }

    // X ticks
    const step = niceStep((hi - lo) / 5);
    const ticks: number[] = [];
    for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);

    const pOver = (v: number) => ({
      normal: normSf((v - mean) / sd),
      lognormal: v <= 0 ? 1 : normSf((Math.log(v) - mu) / sigma),
    });

    const toData = (px: number) => lo + ((px - M.left) / (width - M.left - M.right)) * (hi - lo);

    return { lo, hi, x, y, bars, normPath: path(normYs), logPath: path(logYs), tail, ticks, pOver, toData };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, mean, sd, line, dist, width]);

  if (!model && width >= 100) return null;

  const activeColor = dist === 'normal' ? COLOR_NORMAL : COLOR_LOGNORMAL;
  const hover = model && hoverX !== null && hoverX > model.lo && hoverX < model.hi
    ? { v: hoverX, p: model.pOver(hoverX) }
    : null;

  const handlePointer = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!model) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setHoverX(model.toData(e.clientX - rect.left));
  };

  return (
    <div ref={wrapRef} className="w-full">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-1 text-[11px] text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3.5 h-0.5 rounded" style={{ background: COLOR_NORMAL, opacity: dist === 'normal' ? 1 : 0.45 }} />
          Balanced
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3.5 h-0.5 rounded" style={{ background: COLOR_LOGNORMAL, opacity: dist === 'lognormal' ? 1 : 0.45 }} />
          Boom/Bust
        </span>
        {values.length >= 4 && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-slate-200" />
            Actual games ({values.length})
          </span>
        )}
        <span className="text-slate-400 ml-auto hidden sm:inline">drag to read P(over)</span>
      </div>

      {width > 0 && model && (
        <svg
          width={width}
          height={H}
          className="block select-none"
          style={{ touchAction: 'pan-y' }}
          onPointerMove={handlePointer}
          onPointerDown={handlePointer}
          onPointerLeave={() => setHoverX(null)}
        >
          {/* baseline + ticks */}
          <line x1={M.left} x2={width - M.right} y1={H - M.bottom} y2={H - M.bottom} stroke="#e2e8f0" />
          {model.ticks.map((t) => (
            <g key={t}>
              <line x1={model.x(t)} x2={model.x(t)} y1={H - M.bottom} y2={H - M.bottom + 4} stroke="#e2e8f0" />
              <text x={model.x(t)} y={H - M.bottom + 15} textAnchor="middle" fontSize={10} fill={INK_MUTED}>
                {t}
              </text>
            </g>
          ))}

          {/* histogram (context layer) */}
          {model.bars.map((b) => {
            const bx = model.x(b.x0);
            const bw = Math.max(model.x(b.x1) - bx - 2, 1.5);
            const by = model.y(b.d);
            return (
              <rect key={b.x0} x={bx + 1} y={by} width={bw} height={H - M.bottom - by} rx={2} fill="#e2e8f0">
                <title>{`${b.x0}–${b.x1} ${unit}: ${b.n} game${b.n === 1 ? '' : 's'}`}</title>
              </rect>
            );
          })}

          {/* P(over) tail shade under the active curve */}
          {model.tail && <path d={model.tail} fill={activeColor} opacity={0.12} />}

          {/* curves — active emphasized */}
          <path d={model.normPath} fill="none" stroke={COLOR_NORMAL} strokeWidth={dist === 'normal' ? 2.5 : 1.8}
            opacity={dist === 'normal' ? 1 : 0.45} strokeLinejoin="round" />
          <path d={model.logPath} fill="none" stroke={COLOR_LOGNORMAL} strokeWidth={dist === 'lognormal' ? 2.5 : 1.8}
            opacity={dist === 'lognormal' ? 1 : 0.45} strokeLinejoin="round" />

          {/* betting line marker */}
          {line !== null && line > model.lo && line < model.hi && (
            <g>
              <line x1={model.x(line)} x2={model.x(line)} y1={M.top - 2} y2={H - M.bottom} stroke={INK}
                strokeWidth={1.2} strokeDasharray="4 3" />
              <text x={model.x(line)} y={M.top - 5} textAnchor="middle" fontSize={10} fontWeight={600} fill={INK}>
                {line}
              </text>
            </g>
          )}

          {/* scrub crosshair + readout */}
          {hover && (
            <g>
              <line x1={model.x(hover.v)} x2={model.x(hover.v)} y1={M.top} y2={H - M.bottom} stroke={INK_MUTED} strokeWidth={1} />
              {(() => {
                const onLeft = model.x(hover.v) > width / 2;
                const bx = onLeft ? model.x(hover.v) - 148 : model.x(hover.v) + 8;
                return (
                  <g>
                    <rect x={bx} y={M.top} width={140} height={46} rx={6} fill="white" stroke="#e2e8f0" />
                    <text x={bx + 8} y={M.top + 14} fontSize={10} fontWeight={600} fill={INK}>
                      over {hover.v.toFixed(1)} {unit}
                    </text>
                    <text x={bx + 8} y={M.top + 27} fontSize={10} fill={INK}>
                      <tspan fill={COLOR_NORMAL}>●</tspan> Balanced {(hover.p.normal * 100).toFixed(1)}%
                    </text>
                    <text x={bx + 8} y={M.top + 40} fontSize={10} fill={INK}>
                      <tspan fill={COLOR_LOGNORMAL}>●</tspan> Boom/Bust {(hover.p.lognormal * 100).toFixed(1)}%
                    </text>
                  </g>
                );
              })()}
            </g>
          )}
        </svg>
      )}
    </div>
  );
}
