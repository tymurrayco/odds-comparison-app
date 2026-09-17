'use client';

// src/components/FbsSosPanel.tsx
// SOS tab on the FBS ratings page: every team's strength of schedule as the
// record a MEDIAN FBS team would post against it (venue-adjusted, σ 13.5),
// with a plain venue-adjusted average opponent rating alongside. Filter to
// one conference, restrict to conference games, sort by either measure,
// and open a team to see the game-by-game pricing. Per-game numbers come
// from /api/fbs/sos; the aggregates are computed here so every toggle is
// instant.

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TeamVisual } from './FbsFuturesPanel';

interface SosGame {
  id: string;
  date: string;
  week: number | null;
  opponent: string;
  opponentEspnId: string;
  opponentDivision: 'fbs' | 'fcs' | 'unrated';
  opponentRating: number | null;
  venue: 'home' | 'away' | 'neutral';
  venueEdge: number;
  adjOpponentRating: number | null;
  pWin: number | null;
  conferenceGame: boolean;
  completed: boolean;
  won: boolean | null;
  score: string | null;
}

interface SosTeam {
  teamName: string;
  espnName: string | null;
  espnId: string;
  conference: string | null;
  rating: number;
  hfa: number | null;
  games: SosGame[];
}

interface SosResponse {
  success: boolean;
  error?: string;
  season: number;
  sigma: number;
  medianRating: number;
  teams: SosTeam[];
  generatedAt: string;
}

interface Agg {
  games: number;        // rated games in scope
  expWins: number;      // for a median team
  expPct: number;       // expWins / games
  avgOpp: number;       // venue-adjusted average opponent rating
  played: number;
  remaining: number;
  remRated: number;     // unplayed games with a rated opponent
  remExpWins: number;
  remExpPct: number;
  remAvgOpp: number;
  wins: number;         // the team's own record in scope
  losses: number;
  unrated: number;
}

type SortKey = 'expWins' | 'avgOpp' | 'remaining';

function aggregate(games: SosGame[], confOnly: boolean): Agg {
  const a: Agg = {
    games: 0, expWins: 0, expPct: 0, avgOpp: 0, played: 0, remaining: 0,
    remRated: 0, remExpWins: 0, remExpPct: 0, remAvgOpp: 0, wins: 0, losses: 0, unrated: 0,
  };
  let oppSum = 0;
  let remOppSum = 0;
  for (const g of games) {
    if (confOnly && !g.conferenceGame) continue;
    if (g.completed) {
      a.played++;
      if (g.won) a.wins++; else a.losses++;
    } else {
      a.remaining++;
    }
    if (g.pWin === null || g.adjOpponentRating === null) {
      a.unrated++;
      continue;
    }
    a.games++;
    a.expWins += g.pWin;
    oppSum += g.adjOpponentRating;
    if (!g.completed) {
      a.remRated++;
      a.remExpWins += g.pWin;
      remOppSum += g.adjOpponentRating;
    }
  }
  a.expPct = a.games ? a.expWins / a.games : 0;
  a.avgOpp = a.games ? oppSum / a.games : 0;
  a.remExpPct = a.remRated ? a.remExpWins / a.remRated : 0;
  a.remAvgOpp = a.remRated ? remOppSum / a.remRated : 0;
  return a;
}

const fmt1 = (n: number) => (n >= 0 ? n.toFixed(1) : `−${Math.abs(n).toFixed(1)}`);
const fmtRec = (w: number, l: number) => `${w.toFixed(1)}–${l.toFixed(1)}`;
const pct = (p: number) => `${(p * 100).toFixed(0)}%`;

export default function FbsSosPanel({ visualFor }: { visualFor: (teamName: string) => TeamVisual }) {
  const [data, setData] = useState<SosResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conf, setConf] = useState('all');
  const [confOnly, setConfOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('expWins');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/fbs/sos${fresh ? '?fresh=1' : ''}`);
      const json: SosResponse = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load strength of schedule');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const conferences = useMemo(() => {
    const set = new Set((data?.teams ?? []).map((t) => t.conference || 'Independent'));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [data]);

  // Rank every FBS team first (so a conference view keeps national ranks),
  // then narrow to the selected conference.
  const ranked = useMemo(() => {
    const rows = (data?.teams ?? []).map((t) => ({ t, a: aggregate(t.games, confOnly) }));
    const cmp = (x: { t: SosTeam; a: Agg }, y: { t: SosTeam; a: Agg }) => {
      // Hardest first: fewest expected wins for a median team / highest opponent rating
      if (sortKey === 'avgOpp') return y.a.avgOpp - x.a.avgOpp || x.a.expPct - y.a.expPct;
      if (sortKey === 'remaining') {
        if (x.a.remRated === 0 && y.a.remRated > 0) return 1;
        if (y.a.remRated === 0 && x.a.remRated > 0) return -1;
        return x.a.remExpPct - y.a.remExpPct || y.a.remAvgOpp - x.a.remAvgOpp;
      }
      return x.a.expPct - y.a.expPct || y.a.avgOpp - x.a.avgOpp;
    };
    rows.sort(cmp);
    return rows.map((r, i) => ({ ...r, rank: i + 1 }));
  }, [data, confOnly, sortKey]);

  const visible = useMemo(
    () => (conf === 'all' ? ranked : ranked.filter((r) => (r.t.conference || 'Independent') === conf)),
    [ranked, conf]
  );

  const confSummary = useMemo(() => {
    if (conf === 'all' || visible.length === 0) return null;
    const n = visible.length;
    return {
      rank: visible.reduce((s, r) => s + r.rank, 0) / n,
      expPct: visible.reduce((s, r) => s + r.a.expPct, 0) / n,
      avgOpp: visible.reduce((s, r) => s + r.a.avgOpp, 0) / n,
    };
  }, [visible, conf]);

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

  const sortBtn = (k: SortKey, label: string, title: string) => (
    <button
      key={k}
      type="button"
      title={title}
      onClick={() => setSortKey(k)}
      className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
        sortKey === k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
      }`}
    >
      {label}
    </button>
  );

  const gridCols = 'sm:grid-cols-[2.25rem_1fr_4rem_5.5rem_3.5rem_5.5rem_6rem]';
  const gameCols = 'grid-cols-[2.5rem_1fr_3.5rem_3.5rem_4rem_4.5rem]';

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[16px] font-semibold tracking-[-0.3px] text-slate-700">Strength of schedule</div>
            <div className="text-xs text-slate-500 mt-0.5">
              Each game is priced from the team&apos;s seat — opponent rating plus the venue edge — and turned into the
              chance a <b>median FBS team</b> (rating {data ? fmt1(data.medianRating) : '…'}) wins it. &quot;Avg-team record&quot; is
              those chances added up; rank 1 is the hardest slate. Avg opp is the venue-adjusted opponent rating: a
              +20 team visiting you plays like +17, on their own field like +23.
            </div>
          </div>
          <button
            className="px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 shrink-0"
            disabled={loading}
            onClick={() => load(true)}
          >
            {loading ? '…' : 'Refresh'}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={conf}
            onChange={(e) => setConf(e.target.value)}
            className="px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 bg-white"
          >
            <option value="all">All conferences</option>
            {conferences.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <div className="flex bg-slate-200/70 rounded-full p-0.5">
            {sortBtn('expWins', 'Avg-team record', 'Rank by the win % a median FBS team would post against the full slate (hardest first)')}
            {sortBtn('avgOpp', 'Avg opponent', 'Rank by venue-adjusted average opponent rating (highest first)')}
            {sortBtn('remaining', 'Remaining', 'Rank by the unplayed games only (hardest first)')}
          </div>
          <label className="flex items-center gap-1.5 text-sm text-slate-600 select-none">
            <input type="checkbox" checked={confOnly} onChange={(e) => setConfOnly(e.target.checked)} />
            Conference games only
          </label>
        </div>
        {confSummary && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600 tabular-nums border-t border-slate-100 pt-2">
            <span><b className="text-slate-800">{conf}</b> · {visible.length} teams</span>
            <span>avg national rank <b className="text-slate-800">{confSummary.rank.toFixed(1)}</b></span>
            <span>avg-team win % <b className="text-slate-800">{pct(confSummary.expPct)}</b></span>
            <span>avg opp <b className="text-slate-800">{fmt1(confSummary.avgOpp)}</b></span>
          </div>
        )}
        {error && <div className="p-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
      </div>

      {loading && !data ? (
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-6 text-sm text-slate-500">Pricing schedules…</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className={`hidden sm:grid ${gridCols} items-center px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide bg-slate-50`}>
            <div title="National SOS rank under the current sort">#</div>
            <div>Team</div>
            <div className="text-right" title="The team's own record in scope">W–L</div>
            <div className="text-right" title="Record a median FBS team would post against this slate">Avg-team rec</div>
            <div className="text-right" title="Median-team win % (the ranking number)">Win %</div>
            <div className="text-right" title="Venue-adjusted average opponent rating">Avg opp</div>
            <div className="text-right" title="Unplayed games only: median-team win % · avg opp">Remaining</div>
          </div>
          <div className="divide-y divide-slate-100">
            {visible.map(({ t, a, rank }) => {
              const v = visualFor(t.teamName);
              const isOpen = expanded === t.teamName;
              const expLosses = a.games - a.expWins;
              return (
                <div key={t.teamName}>
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : t.teamName)}
                    className={`w-full text-left grid grid-cols-[2.25rem_1fr_auto] ${gridCols} items-center px-3 py-2 hover:bg-slate-50/60`}
                    style={{ boxShadow: `inset 3px 0 0 ${v.color}` }}
                  >
                    <div className="text-xs text-slate-400 tabular-nums">{rank}</div>
                    <Chip
                      name={t.teamName}
                      sub={`${fmt1(t.rating)} · ${t.conference ?? 'Independent'} · ${a.played} played, ${a.remaining} left${a.unrated ? ` · ${a.unrated} unrated` : ''}`}
                    />
                    <div className="text-right sm:hidden">
                      <div className="text-sm font-semibold tabular-nums text-slate-800">{fmtRec(a.expWins, expLosses)}</div>
                      <div className="text-[11px] text-slate-400 tabular-nums">{pct(a.expPct)} · opp {fmt1(a.avgOpp)}</div>
                    </div>
                    <div className="hidden sm:block text-right text-sm text-slate-800 tabular-nums">{a.wins}–{a.losses}</div>
                    <div className="hidden sm:block text-right text-sm font-semibold text-slate-800 tabular-nums">{fmtRec(a.expWins, expLosses)}</div>
                    <div className="hidden sm:block text-right text-sm text-slate-600 tabular-nums">{pct(a.expPct)}</div>
                    <div className="hidden sm:block text-right text-sm text-slate-600 tabular-nums">{fmt1(a.avgOpp)}</div>
                    <div className="hidden sm:block text-right text-sm text-slate-600 tabular-nums whitespace-nowrap">
                      {a.remRated ? `${pct(a.remExpPct)} · ${fmt1(a.remAvgOpp)}` : '—'}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t border-slate-100 bg-slate-50/40">
                      <div className={`grid ${gameCols} items-center px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide`}>
                        <div>Wk</div>
                        <div>Opponent</div>
                        <div className="text-right" title="Opponent rating on the FBS scale (FCS bridged)">Rtg</div>
                        <div className="text-right" title="Opponent rating net of the venue edge — what the game plays like">Venue</div>
                        <div className="text-right" title="Chance a median FBS team wins this game">Avg-team</div>
                        <div className="text-right">Result</div>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {t.games.filter((g) => !confOnly || g.conferenceGame).map((g) => {
                          const ov = visualFor(g.opponent);
                          const venueTxt = g.venue === 'neutral' ? 'N' : g.venue === 'home' ? 'vs' : '@';
                          return (
                            <div key={g.id} className={`grid ${gameCols} items-center px-3 py-1.5 text-sm tabular-nums`}>
                              <div className="text-xs text-slate-400">{g.week ?? '—'}</div>
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="w-4 text-xs text-slate-400 shrink-0">{venueTxt}</span>
                                {ov.logo ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={ov.logo} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />
                                ) : (
                                  <span className="w-5 h-5 rounded-full shrink-0 bg-slate-200" />
                                )}
                                <span className="truncate text-slate-800">{g.opponent}</span>
                                {g.opponentDivision === 'fcs' && <span className="text-[10px] text-slate-400 shrink-0">FCS</span>}
                                {g.conferenceGame && <span className="text-[10px] text-slate-400 shrink-0" title="Conference game">conf</span>}
                              </div>
                              <div className="text-right text-slate-700">{g.opponentRating === null ? '—' : fmt1(g.opponentRating)}</div>
                              <div
                                className="text-right text-slate-500"
                                title={`Venue edge ${fmt1(g.venueEdge)} for ${t.teamName}`}
                              >
                                {g.adjOpponentRating === null ? '—' : fmt1(g.adjOpponentRating)}
                              </div>
                              <div className="text-right text-slate-700">{g.pWin === null ? 'unrated' : pct(g.pWin)}</div>
                              <div className={`text-right ${g.won === true ? 'text-emerald-700' : g.won === false ? 'text-red-600' : 'text-slate-400'}`}>
                                {g.completed ? `${g.won ? 'W' : 'L'} ${g.score}` : '—'}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {visible.length === 0 && (
              <div className="px-4 py-6 text-sm text-slate-500">No teams.</div>
            )}
          </div>
        </div>
      )}
      {data && (
        <p className="text-[11px] text-slate-400 text-center tabular-nums">
          σ {data.sigma} pts · median FBS rating {fmt1(data.medianRating)} · {ranked.length} teams · generated {new Date(data.generatedAt).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
