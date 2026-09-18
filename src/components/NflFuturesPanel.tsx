'use client';

// src/components/NflFuturesPanel.tsx
// Futures tab on the NFL ratings pages: division titles, conference titles
// and the Super Bowl from the Ledger season sim (/api/nfl/futures). Three
// views share the same rows; the timing badge (next N games) runs against
// the division title.

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import TimingBadge, { TimingView } from './TimingBadge';

interface Team {
  teamName: string;
  espnAbbr: string | null;
  espnId: string | null;
  division: string;
  conference: string;
  rating: number;
  wins: number;
  losses: number;
  ties: number;
  projWins: number;
  projLosses: number;
  pDiv: number;
  pPlayoff: number;
  pSeed1: number;
  pConf: number;
  pSb: number;
  divOdds: number | null;
  confOdds: number | null;
  sbOdds: number | null;
  timing: TimingView | null;
}
interface Division { name: string; conference: string; teams: Team[] }
interface Conference { name: string; teams: Team[] }
interface FuturesResponse {
  success: boolean;
  error?: string;
  season: number;
  sims: number;
  sigma: number;
  window: number;
  divisions: Division[];
  conferences: Conference[];
  teams: Team[];
  gamesSimulated: number;
  generatedAt: string;
}

interface TeamVisual { logo: string | null; color: string; href?: string | null }
type View = 'div' | 'conf' | 'sb';

const VIEW_KEY = 'nfl-futures-view';
const WINDOW_KEY = 'fbs-timing-window';
const readWindow = () => {
  try { const v = Number(localStorage.getItem(WINDOW_KEY)); return [2, 3, 4].includes(v) ? v : 3; } catch { return 3; }
};
const readView = (): View => {
  try { const v = localStorage.getItem(VIEW_KEY); return v === 'conf' || v === 'sb' ? v : 'div'; } catch { return 'div'; }
};

const fmtOdds = (o: number | null) => (o === null ? '—' : o > 0 ? `+${o}` : String(o));
const pct = (p: number, dp = 1) => `${(p * 100).toFixed(dp)}%`;
const rec = (t: Team) => `${t.wins}–${t.losses}${t.ties ? `–${t.ties}` : ''}`;

export default function NflFuturesPanel({ visualFor }: { visualFor: (teamName: string) => TeamVisual }) {
  const [data, setData] = useState<FuturesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>(readView);
  const [window, setWindow] = useState<number>(readWindow);

  const load = useCallback(async (w: number, fresh = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/nfl/futures?window=${w}${fresh ? '&fresh=1' : ''}`);
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
    try { localStorage.setItem(WINDOW_KEY, String(window)); } catch { /* per-viewer */ }
    load(window);
  }, [load, window]);
  useEffect(() => {
    try { localStorage.setItem(VIEW_KEY, view); } catch { /* per-viewer */ }
  }, [view]);

  const Chip = ({ t }: { t: Team }) => {
    const v = visualFor(t.teamName);
    const inner = (
      <>
        {v.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={v.logo} alt="" className="w-6 h-6 object-contain shrink-0" loading="lazy" />
        ) : (
          <span className="w-6 h-6 rounded-full shrink-0" style={{ backgroundColor: `${v.color}33` }} />
        )}
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-800 truncate group-hover/team:underline">{t.teamName}</div>
          <div className="text-[11px] text-slate-400 truncate tabular-nums">
            {t.rating.toFixed(1)} · {rec(t)} · proj {t.projWins.toFixed(1)}–{t.projLosses.toFixed(1)}
          </div>
        </div>
      </>
    );
    return v.href ? (
      <Link href={v.href} onClick={(e) => e.stopPropagation()} className="group/team flex items-center gap-2 min-w-0" title={`${t.teamName} — team page`}>{inner}</Link>
    ) : (
      <div className="flex items-center gap-2 min-w-0">{inner}</div>
    );
  };

  // Which probability leads the row in each view, and its fair price
  const lead = (t: Team): { p: number; odds: number | null } =>
    view === 'div' ? { p: t.pDiv, odds: t.divOdds } : view === 'conf' ? { p: t.pConf, odds: t.confOdds } : { p: t.pSb, odds: t.sbOdds };

  const gridCols = 'sm:grid-cols-[1fr_5rem_4.5rem_4.5rem_4.5rem_4.5rem_4.5rem_5rem]';
  const Header = () => (
    <div className={`hidden sm:grid ${gridCols} items-center px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide bg-slate-50`}>
      <div>Team</div>
      <div className="text-right">{view === 'div' ? 'Division' : view === 'conf' ? 'Conference' : 'Super Bowl'}</div>
      <div className="text-right" title="Wins the division">Div</div>
      <div className="text-right" title="Makes the playoffs">Playoffs</div>
      <div className="text-right" title="No. 1 seed (bye)">1 seed</div>
      <div className="text-right" title="Wins the conference">Conf</div>
      <div className="text-right" title="Wins the Super Bowl">SB</div>
      <div className="text-right" title="Fair American price on the headline probability">Fair</div>
    </div>
  );
  const Row = ({ t }: { t: Team }) => {
    const v = visualFor(t.teamName);
    const l = lead(t);
    return (
      <div className={`grid grid-cols-[1fr_auto] ${gridCols} items-center gap-2 px-3 py-2`} style={{ boxShadow: `inset 3px 0 0 ${v.color}` }}>
        <div className="flex items-center gap-2 min-w-0">
          <Chip t={t} />
          <TimingBadge timing={t.timing} outcome="Division" />
        </div>
        <div className="text-right sm:hidden">
          <div className="text-sm font-semibold tabular-nums text-slate-800">{pct(l.p)}</div>
          <div className="text-[11px] text-slate-400 tabular-nums">{fmtOdds(l.odds)} · SB {pct(t.pSb)}</div>
        </div>
        <div className="hidden sm:block text-right text-sm font-semibold tabular-nums text-slate-800">{pct(l.p)}</div>
        <div className={`hidden sm:block text-right text-sm tabular-nums ${view === 'div' ? 'text-slate-800' : 'text-slate-500'}`}>{pct(t.pDiv, 0)}</div>
        <div className="hidden sm:block text-right text-sm tabular-nums text-slate-500">{pct(t.pPlayoff, 0)}</div>
        <div className="hidden sm:block text-right text-sm tabular-nums text-slate-500">{pct(t.pSeed1, 0)}</div>
        <div className={`hidden sm:block text-right text-sm tabular-nums ${view === 'conf' ? 'text-slate-800' : 'text-slate-500'}`}>{pct(t.pConf)}</div>
        <div className={`hidden sm:block text-right text-sm tabular-nums ${view === 'sb' ? 'text-slate-800' : 'text-slate-500'}`}>{pct(t.pSb)}</div>
        <div className="hidden sm:block text-right text-sm tabular-nums text-slate-600">{fmtOdds(l.odds)}</div>
      </div>
    );
  };

  const groups = useMemo(() => {
    if (!data) return [];
    if (view === 'div') return data.divisions.map((d) => ({ name: d.name, teams: d.teams }));
    if (view === 'conf') return data.conferences.map((c) => ({ name: c.name, teams: c.teams }));
    return [{ name: 'Super Bowl', teams: data.teams }];
  }, [data, view]);

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[16px] font-semibold tracking-[-0.3px] text-slate-700">NFL futures — division, conference, Super Bowl</div>
            <div className="text-xs text-slate-500 mt-0.5">
              Every remaining game priced from the Ledger spread (σ {data?.sigma ?? 13}), the season played{' '}
              {data?.sims?.toLocaleString() ?? '5,000'} times: divisions on record with NFL tiebreakers, seven-team
              brackets, higher seed at home, neutral Super Bowl. Prices are fair — no vig.
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <label className="flex items-center gap-1.5 text-xs text-slate-500" title="Market timing: how many upcoming games make the stretch (badge runs against the division title)">
              Next
              <select value={window} onChange={(e) => setWindow(Number(e.target.value))} className="px-1.5 py-1 text-xs rounded-md border border-slate-200 bg-white">
                {[2, 3, 4].map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
            </label>
            <button className="px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50" disabled={loading} onClick={() => load(window, true)}>
              {loading ? '…' : 'Refresh'}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-slate-200/70 rounded-full p-0.5">
            {([['div', 'Division'], ['conf', 'Conference'], ['sb', 'Super Bowl']] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setView(k)} className={`px-3 py-1 rounded-full text-xs font-medium transition ${view === k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>
                {label}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-slate-400">
            <span className="px-1 rounded bg-emerald-100 text-emerald-800 font-semibold">▲</span> buy before a soft stretch ·{' '}
            <span className="px-1 rounded bg-red-100 text-red-700 font-semibold">▼</span> sell or wait before a hard one · badge measures the division title.
          </span>
        </div>
        {error && <div className="p-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
      </div>

      {loading && !data ? (
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-6 text-sm text-slate-500">Simulating…</div>
      ) : (
        <div className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>
          {groups.map((g) => (
            <div key={g.name} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {view !== 'sb' && (
                <div className="px-3 sm:px-4 py-2 flex items-center justify-between border-b border-slate-100">
                  <div className="text-sm font-semibold text-slate-800">{g.name}</div>
                  {g.teams[0] && (
                    <div className="text-xs text-slate-500 tabular-nums">
                      {g.teams[0].teamName} {pct(lead(g.teams[0]).p, 0)} · {fmtOdds(lead(g.teams[0]).odds)}
                    </div>
                  )}
                </div>
              )}
              <Header />
              <div className="divide-y divide-slate-100">
                {g.teams.map((t) => <Row key={t.teamName} t={t} />)}
              </div>
            </div>
          ))}
        </div>
      )}
      {data && (
        <p className="text-[11px] text-slate-400 text-center tabular-nums">
          σ {data.sigma} pts · {data.sims.toLocaleString()} seasons · {data.gamesSimulated} games · ratings as of the last sync · generated {new Date(data.generatedAt).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
