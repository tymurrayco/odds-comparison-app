'use client';

// src/components/FbsG5PlayoffPanel.tsx
// G5 Playoff tab on the FBS ratings pages: every Group of Five team's
// chance at the playoff's G5 spot — win the league, then be the committee's
// top-ranked G5 champion. The loss penalty slider sets how much a loss
// costs in the committee score (rating − penalty × losses); the sim reruns
// on each change. Numbers from /api/fbs/g5-playoff.

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TeamVisual } from './FbsFuturesPanel';

interface G5Team {
  teamName: string;
  espnName: string | null;
  espnId: string | null;
  conference: string;
  rating: number;
  wins: number;
  losses: number;
  projWins: number;
  projLosses: number;
  unratedGames: number;
  pChamp: number;
  pBestIfChamp: number;
  pPlayoff: number;
  odds: number | null;
  avgChampLosses: number | null;
}

interface G5Conference {
  name: string;
  pBid: number;
  teams: G5Team[];
}

interface G5Response {
  success: boolean;
  error?: string;
  season: number;
  sims: number;
  sigma: number;
  lossPenalty: number;
  conferences: G5Conference[];
  teams: G5Team[];
  generatedAt: string;
}

const PENALTY_KEY = 'fbs-g5-loss-penalty';
const fmtOdds = (o: number | null) => (o === null ? '—' : o > 0 ? `+${o}` : String(o));
const pct = (p: number, dp = 1) => `${(p * 100).toFixed(dp)}%`;
const rec = (w: number, l: number) => `${w % 1 === 0 ? w : w.toFixed(1)}–${l % 1 === 0 ? l : l.toFixed(1)}`;

export default function FbsG5PlayoffPanel({ visualFor }: { visualFor: (teamName: string) => TeamVisual }) {
  const [penalty, setPenalty] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem(PENALTY_KEY));
      return Number.isFinite(v) && localStorage.getItem(PENALTY_KEY) !== null ? v : 4;
    } catch { return 4; }
  });
  const [applied, setApplied] = useState<number>(penalty); // what the last fetch used
  const [data, setData] = useState<G5Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conf, setConf] = useState('all');

  const load = useCallback(async (p: number, fresh = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/fbs/g5-playoff?penalty=${p}${fresh ? '&fresh=1' : ''}`);
      const json: G5Response = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
      setApplied(p);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load G5 playoff odds');
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce slider drags; persist the chosen penalty per browser
  useEffect(() => {
    try { localStorage.setItem(PENALTY_KEY, String(penalty)); } catch { /* per-viewer convenience */ }
    const t = setTimeout(() => load(penalty), 250);
    return () => clearTimeout(t);
  }, [penalty, load]);

  const rows = useMemo(() => {
    const all = data?.teams ?? [];
    return conf === 'all' ? all : all.filter((t) => t.conference === conf);
  }, [data, conf]);
  const confInfo = useMemo(() => data?.conferences.find((c) => c.name === conf) ?? null, [data, conf]);

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
      <Link href={v.href} className="group/team flex items-center gap-2 min-w-0" title={`${name} — team page`}>{inner}</Link>
    ) : (
      <div className="flex items-center gap-2 min-w-0">{inner}</div>
    );
  };

  const gridCols = 'sm:grid-cols-[2.25rem_1fr_4rem_5rem_4.5rem_4.5rem_5rem_4.5rem]';

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[16px] font-semibold tracking-[-0.3px] text-slate-700">Group of Five playoff spot</div>
            <div className="text-xs text-slate-500 mt-0.5">
              One G5 champion makes the 12-team field: the one the committee ranks highest. Each of{' '}
              {data?.sims?.toLocaleString() ?? '5,000'} simulated seasons plays every G5 game, settles each league (title game
              on a neutral field), then ranks the champions by <b>rating − penalty × losses</b>. Playoff % = share of
              seasons a team is that top champion. At-large G5 bids are ignored.
            </div>
          </div>
          <button
            className="px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 shrink-0"
            disabled={loading}
            onClick={() => load(penalty, true)}
          >
            {loading ? '…' : 'Refresh'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <span className="whitespace-nowrap">Loss penalty</span>
            <input
              type="range"
              min={0}
              max={10}
              step={0.5}
              value={penalty}
              onChange={(e) => setPenalty(Number(e.target.value))}
              className="w-40 accent-[#0052ff]"
            />
            <span className="tabular-nums font-semibold text-slate-800 w-16">{penalty.toFixed(1)} pts</span>
          </label>
          <span className="text-[11px] text-slate-400">
            {penalty === 0
              ? 'Record ignored: best rating wins.'
              : `A loss costs ${penalty} rating points. Two teams tie when the better-rated one has ${penalty} points more per extra loss.`}
          </span>
          <select value={conf} onChange={(e) => setConf(e.target.value)} className="ml-auto px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 bg-white">
            <option value="all">All G5 conferences</option>
            {(data?.conferences ?? []).map((c) => (
              <option key={c.name} value={c.name}>{c.name} · {pct(c.pBid, 0)}</option>
            ))}
          </select>
        </div>

        {data && conf === 'all' && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 tabular-nums border-t border-slate-100 pt-2">
            <span className="text-slate-400">Whose champion gets the spot:</span>
            {data.conferences.map((c) => (
              <button key={c.name} className="hover:underline" onClick={() => setConf(c.name)}>
                <b className="text-slate-800">{c.name}</b> {pct(c.pBid, 0)}
              </button>
            ))}
          </div>
        )}
        {confInfo && (
          <div className="text-xs text-slate-500 tabular-nums border-t border-slate-100 pt-2">
            <b className="text-slate-800">{confInfo.name}</b> champion takes the spot in <b className="text-slate-800">{pct(confInfo.pBid)}</b> of seasons.
          </div>
        )}
        {error && <div className="p-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
      </div>

      {loading && !data ? (
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-6 text-sm text-slate-500">Simulating…</div>
      ) : (
        <div className={`bg-white rounded-xl border border-slate-200 overflow-hidden ${loading ? 'opacity-60' : ''}`}>
          <div className={`hidden sm:grid ${gridCols} items-center px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide bg-slate-50`}>
            <div>#</div>
            <div>Team</div>
            <div className="text-right" title="Completed games">W–L</div>
            <div className="text-right" title="Projected regular season (title game not included)">Proj</div>
            <div className="text-right" title="Wins its conference, title game included">Champ</div>
            <div className="text-right" title="Best-ranked G5 champion, given it won its league">Top if champ</div>
            <div className="text-right" title="Makes the playoff">Playoff</div>
            <div className="text-right" title="Fair American price on the playoff probability">Fair</div>
          </div>
          <div className="divide-y divide-slate-100">
            {rows.map((t, i) => {
              const v = visualFor(t.teamName);
              return (
                <div
                  key={t.teamName}
                  className={`grid grid-cols-[2.25rem_1fr_auto] ${gridCols} items-center px-3 py-2`}
                  style={{ boxShadow: `inset 3px 0 0 ${v.color}` }}
                >
                  <div className="text-xs text-slate-400 tabular-nums">{i + 1}</div>
                  <Chip
                    name={t.teamName}
                    sub={`${t.rating.toFixed(1)} · ${t.conference}${t.avgChampLosses !== null && t.pChamp > 0.01 ? ` · ${t.avgChampLosses} losses when it wins the league` : ''}${t.unratedGames ? ` · ${t.unratedGames} unrated` : ''}`}
                  />
                  <div className="text-right sm:hidden">
                    <div className="text-sm font-semibold tabular-nums text-slate-800">{pct(t.pPlayoff)}</div>
                    <div className="text-[11px] text-slate-400 tabular-nums">{fmtOdds(t.odds)} · champ {pct(t.pChamp, 0)}</div>
                  </div>
                  <div className="hidden sm:block text-right text-sm text-slate-800 tabular-nums">{rec(t.wins, t.losses)}</div>
                  <div className="hidden sm:block text-right text-sm text-slate-600 tabular-nums">{rec(t.projWins, t.projLosses)}</div>
                  <div className="hidden sm:block text-right text-sm text-slate-600 tabular-nums">{pct(t.pChamp)}</div>
                  <div className="hidden sm:block text-right text-sm text-slate-600 tabular-nums">{t.pChamp > 0 ? pct(t.pBestIfChamp, 0) : '—'}</div>
                  <div className={`hidden sm:block text-right text-sm font-semibold tabular-nums ${t.pPlayoff >= 0.2 ? 'text-emerald-700' : 'text-slate-800'}`}>{pct(t.pPlayoff)}</div>
                  <div className="hidden sm:block text-right text-sm text-slate-600 tabular-nums">{fmtOdds(t.odds)}</div>
                </div>
              );
            })}
            {rows.length === 0 && <div className="px-4 py-6 text-sm text-slate-500">No teams.</div>}
          </div>
        </div>
      )}
      {data && (
        <p className="text-[11px] text-slate-400 text-center tabular-nums">
          σ {data.sigma} pts · penalty {applied} · {data.sims.toLocaleString()} seasons · ratings as of the last sync · generated{' '}
          {new Date(data.generatedAt).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
