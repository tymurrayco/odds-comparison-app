'use client';

// src/components/FbsFuturesPanel.tsx
// Futures tab on /fbs: each conference's projected regular-season champion
// with a fair price, unfurling to every team's title odds, projected
// records and remaining games. Numbers come from /api/fbs/futures (Ledger
// ratings + remaining schedule, simulated).

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

interface FuturesTeam {
  teamName: string;
  espnName: string | null;
  espnId: string | null;
  rating: number;
  confWins: number;
  confLosses: number;
  confRemaining: number;
  projConfWins: number;
  projConfLosses: number;
  wins: number;
  losses: number;
  projWins: number;
  projLosses: number;
  unratedGames: number;
  titleProb: number;
  odds: number | null;
  top2Prob: number;
}

interface FuturesConference {
  name: string;
  teams: FuturesTeam[];
  gamesPlayed: number;
  gamesRemaining: number;
  championship: {
    gold: string;
    silver: string;
    goldTop2Prob: number;
    silverTop2Prob: number;
    spread: number;
  } | null;
}

interface FuturesResponse {
  success: boolean;
  error?: string;
  season: number;
  sims: number;
  sigma: number;
  conferences: FuturesConference[];
  generatedAt: string;
}

export interface TeamVisual {
  logo: string | null;
  color: string;
  href?: string | null;
}

const fmtOdds = (o: number | null) => (o === null ? '—' : o > 0 ? `+${o}` : String(o));
const fmtRec = (w: number, l: number) => `${w % 1 === 0 ? w : w.toFixed(1)}–${l % 1 === 0 ? l : l.toFixed(1)}`;

export default function FbsFuturesPanel({ visualFor }: { visualFor: (teamName: string) => TeamVisual }) {
  const [data, setData] = useState<FuturesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/fbs/futures');
      const json: FuturesResponse = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load futures');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
      <Link href={v.href} onClick={(e) => e.stopPropagation()} className="group/team flex items-center gap-2 min-w-0" title={`${name} — team page`}>
        {inner}
      </Link>
    ) : (
      <div className="flex items-center gap-2 min-w-0">{inner}</div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[16px] font-semibold tracking-[-0.3px] text-slate-700">
              Conference futures — regular-season champion
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              Every remaining game priced from the Ledger ratings (spread → win probability), each race
              simulated {data?.sims?.toLocaleString() ?? '5,000'} times. Two-way ties go to head-to-head, other ties split.
              Prices are fair — no vig — so compare them to a book&apos;s after removing its hold.
            </div>
          </div>
          <button
            className="px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 shrink-0"
            disabled={loading}
            onClick={load}
          >
            {loading ? '…' : 'Refresh'}
          </button>
        </div>
        {error && <div className="mt-2 p-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
      </div>

      {loading && !data ? (
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-6 text-sm text-slate-500">Simulating…</div>
      ) : (
        (data?.conferences ?? []).map((c) => {
          const fav = c.teams[0];
          const isOpen = !!open[c.name];
          return (
            <div key={c.name} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setOpen((o) => ({ ...o, [c.name]: !o[c.name] }))}
                className="w-full text-left px-3 sm:px-4 py-3 flex items-center gap-3"
              >
                <div className="w-28 sm:w-36 shrink-0">
                  <div className="text-sm font-semibold text-slate-800">{c.name}</div>
                  <div className="text-[11px] text-slate-400 tabular-nums">
                    {c.gamesPlayed} played · {c.gamesRemaining} left
                  </div>
                </div>
                {fav && (
                  <div className="flex-1 min-w-0 flex items-center gap-3">
                    <Chip name={fav.teamName} sub={`${fmtRec(fav.confWins, fav.confLosses)} conf · proj ${fmtRec(fav.projWins, fav.projLosses)}`} />
                  </div>
                )}
                {fav && (
                  <div className="text-right shrink-0">
                    <div className="text-base font-bold tabular-nums text-slate-800">{fmtOdds(fav.odds)}</div>
                    <div className="text-[11px] text-slate-400 tabular-nums">{(fav.titleProb * 100).toFixed(0)}%</div>
                  </div>
                )}
                <span className="text-slate-400 text-xs shrink-0">{isOpen ? '▾' : '▸'}</span>
              </button>
              {isOpen && (
                <div className="border-t border-slate-100">
                  <div className="hidden sm:grid grid-cols-[1.75rem_1fr_4rem_5rem_5rem_4.5rem_3.5rem] items-center px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide bg-slate-50">
                    <div>#</div>
                    <div>Team</div>
                    <div className="text-right">Conf</div>
                    <div className="text-right" title="Projected conference record">Proj conf</div>
                    <div className="text-right" title="Projected overall record">Proj W–L</div>
                    <div className="text-right">Price</div>
                    <div className="text-right">Title</div>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {c.teams.map((t, i) => {
                      const v = visualFor(t.teamName);
                      const medal =
                        c.championship?.gold === t.teamName ? '🥇' : c.championship?.silver === t.teamName ? '🥈' : null;
                      const ch = c.championship;
                      // Title-game bar sits under the gold row: the likeliest
                      // matchup and its neutral-field spread from the ratings.
                      const titleBar = ch && ch.gold === t.teamName && (
                        <div
                          className="flex items-center justify-center gap-2 px-3 py-1.5 text-[11px] tabular-nums text-amber-900"
                          style={{ background: 'linear-gradient(90deg, #fef3c7, #fde68a 50%, #fef3c7)' }}
                          title={`Most likely title game. Top-two chances: ${ch.gold} ${(ch.goldTop2Prob * 100).toFixed(0)}%, ${ch.silver} ${(ch.silverTop2Prob * 100).toFixed(0)}%`}
                        >
                          <span className="uppercase tracking-wide text-[10px] font-semibold text-amber-700">Title game</span>
                          <span className="font-semibold">
                            {ch.spread <= 0
                              ? `${ch.gold} ${ch.spread === 0 ? 'PK' : ch.spread.toFixed(1)} vs ${ch.silver}`
                              : `${ch.silver} ${(-ch.spread).toFixed(1)} vs ${ch.gold}`}
                          </span>
                          <span className="text-amber-700">· neutral field</span>
                        </div>
                      );
                      return (
                        <div key={t.teamName}>
                        <div
                          className="grid grid-cols-[1.75rem_1fr_auto] sm:grid-cols-[1.75rem_1fr_4rem_5rem_5rem_4.5rem_3.5rem] items-center px-3 py-2"
                          style={{ boxShadow: `inset 3px 0 0 ${v.color}` }}
                        >
                          <div className="text-xs text-slate-400 tabular-nums">{medal ?? i + 1}</div>
                          <Chip
                            name={t.teamName}
                            sub={`${t.rating.toFixed(1)} · ${fmtRec(t.confWins, t.confLosses)} conf · proj ${fmtRec(t.projWins, t.projLosses)}${t.unratedGames ? ` · ${t.unratedGames} unrated` : ''}`}
                          />
                          <div className="text-right sm:hidden">
                            <div className="text-sm font-semibold tabular-nums text-slate-800">{fmtOdds(t.odds)}</div>
                            <div className="text-[11px] text-slate-400 tabular-nums">{(t.titleProb * 100).toFixed(1)}%</div>
                          </div>
                          <div className="hidden sm:block text-right text-sm text-slate-600 tabular-nums">{fmtRec(t.confWins, t.confLosses)}</div>
                          <div className="hidden sm:block text-right text-sm text-slate-600 tabular-nums">{fmtRec(t.projConfWins, t.projConfLosses)}</div>
                          <div className="hidden sm:block text-right text-sm text-slate-600 tabular-nums">{fmtRec(t.projWins, t.projLosses)}</div>
                          <div className="hidden sm:block text-right text-sm font-semibold tabular-nums text-slate-800">{fmtOdds(t.odds)}</div>
                          <div className="hidden sm:block text-right text-sm text-slate-500 tabular-nums">{(t.titleProb * 100).toFixed(1)}%</div>
                        </div>
                        {titleBar}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
      {data && (
        <p className="text-[11px] text-slate-400 text-center tabular-nums">
          σ {data.sigma} pts · ratings as of the last sync · generated {new Date(data.generatedAt).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
