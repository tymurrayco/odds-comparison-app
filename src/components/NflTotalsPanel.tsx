'use client';

// src/components/NflTotalsPanel.tsx
// Totals tab of the NFL Ledger page: per-team fundamentals (pace, points per
// play for and against, blended season+prior) and the market term moved by
// closing totals, plus the totals ledger. Self-contained: loads
// /api/nfl/totals and runs its own seed / sync / recalculate actions.

import { useCallback, useEffect, useMemo, useState } from 'react';

const btnCls =
  'px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed';
const primaryBtnCls =
  'px-3 py-2 text-sm font-medium rounded-lg bg-[#0052ff] text-white hover:bg-[#0043d1] disabled:opacity-50 disabled:cursor-not-allowed';

interface TotalsTeamRow {
  teamName: string;
  espnAbbr: string | null;
  pace: number;
  offPpp: number;
  defPpp: number;
  statGames: number;
  priorPace: number;
  priorOffPpp: number;
  priorDefPpp: number;
  marketTerm: number;
  initialMarketTerm: number;
  gamesProcessed: number;
  offRating: number; // pts/game vs average defence at league pace
  defRating: number; // pts/game allowed vs average offence
}

interface TotalsAdjRow {
  gameId: string;
  gameDate: string;
  homeTeam: string;
  awayTeam: string;
  playsExpected: number;
  fundTotal: number;
  homeTermBefore: number;
  awayTermBefore: number;
  projectedTotal: number;
  closingTotal: number;
  closingSource: string;
  difference: number;
  adjustment: number;
}

interface TotalsResponse {
  success: boolean;
  error?: string;
  season: number;
  config: {
    leagueAvgPace: number;
    leagueAvgPpp: number;
    blendK: number;
    priorRegress: number;
    seedLabel: string | null;
    lastProcessedDate: string | null;
  };
  teams: TotalsTeamRow[];
  adjustments: TotalsAdjRow[];
  totalAdjustments: number;
  statsGames: number;
}

export interface TeamVisual {
  logo: string | null;
  color: string;
}

const fmtSigned = (v: number, places = 2) => {
  const r = Math.round(v * 10 ** places) / 10 ** places;
  if (r === 0) return <span className="text-slate-400">{r.toFixed(places)}</span>;
  return (
    <span className={r > 0 ? 'text-emerald-600' : 'text-red-600'}>
      {r > 0 ? '+' : ''}
      {r.toFixed(places)}
    </span>
  );
};

export default function NflTotalsPanel({
  admin,
  visualFor,
}: {
  admin: boolean;
  visualFor: (teamName: string) => TeamVisual;
}) {
  const [data, setData] = useState<TotalsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<'rating' | 'off' | 'def' | 'pace' | 'market' | 'team'>('rating');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/nfl/totals');
      const json: TotalsResponse = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load totals');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (label: string, body: Record<string, unknown>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(label);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/nfl/totals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setMessage(json.summary ?? 'Done.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : `${label} failed`);
    } finally {
      setBusy(null);
    }
  };

  const rows = useMemo(() => {
    const list = [...(data?.teams ?? [])];
    const net = (t: TotalsTeamRow) => t.offRating - t.defRating + t.marketTerm;
    switch (sortKey) {
      case 'off': return list.sort((a, b) => b.offRating - a.offRating);
      case 'def': return list.sort((a, b) => a.defRating - b.defRating);
      case 'pace': return list.sort((a, b) => b.pace - a.pace);
      case 'market': return list.sort((a, b) => b.marketTerm - a.marketTerm);
      case 'team': return list.sort((a, b) => a.teamName.localeCompare(b.teamName));
      default: return list.sort((a, b) => net(b) - net(a));
    }
  }, [data, sortKey]);

  const chip = (key: typeof sortKey, label: string) => (
    <button
      key={key}
      onClick={() => setSortKey(key)}
      className={`px-2.5 py-1 rounded-full text-xs font-medium transition whitespace-nowrap ${
        sortKey === key ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {label}
    </button>
  );

  const cfg = data?.config;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 space-y-2">
        <div className="text-[16px] font-semibold tracking-[-0.3px] text-slate-700">Totals Ledger</div>
        <p className="text-xs text-slate-500">
          Projected total = expected plays × (offense + opponent defense − league average points per play)
          for each side, plus each team&apos;s market term. Fundamentals blend this season&apos;s box scores
          with last season&apos;s (weight = games ÷ (games + {cfg?.blendK ?? 4})); the market term moves by
          half of every closing-total miss, for both teams.
        </p>
        {cfg && (
          <p className="text-xs text-slate-500 tabular-nums">
            League avg {cfg.leagueAvgPace.toFixed(1)} plays · {cfg.leagueAvgPpp.toFixed(3)} pts/play
            {' · '}{data?.statsGames ?? 0} box scores this season · {data?.totalAdjustments ?? 0} closes priced
            {cfg.seedLabel ? ` · ${cfg.seedLabel}` : ''}
          </p>
        )}
        {admin && (
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              className={`${primaryBtnCls} flex-1 sm:flex-none`}
              disabled={busy !== null || (data?.teams.length ?? 0) === 0}
              onClick={() => run('sync', { action: 'sync' })}
            >
              {busy === 'sync' ? 'Syncing…' : 'Sync Totals'}
            </button>
            <button
              className={`${btnCls} flex-1 sm:flex-none`}
              disabled={busy !== null}
              onClick={() =>
                run(
                  'seed',
                  { action: 'seed', forceRefresh: (data?.teams.length ?? 0) === 0 ? undefined : false },
                  (data?.teams.length ?? 0) > 0
                    ? 'Refresh priors from last season’s box scores and refit market terms for any new team? Existing market terms are kept.'
                    : undefined
                )
              }
            >
              {busy === 'seed' ? 'Seeding…' : 'Seed Totals'}
            </button>
            <button
              className={`${btnCls} flex-1 sm:flex-none`}
              disabled={busy !== null}
              onClick={() =>
                run(
                  'reseed',
                  { action: 'seed', forceRefresh: true },
                  'Refit every market term to the totals the books post TODAY and reset the ledger count? Preseason only — follow with Recalculate if closes have been priced.'
                )
              }
            >
              {busy === 'reseed' ? 'Refitting…' : 'Refit Market'}
            </button>
            <button
              className={`${btnCls} flex-1 sm:flex-none`}
              disabled={busy !== null || (data?.totalAdjustments ?? 0) === 0}
              onClick={() =>
                run('recalc', { action: 'recalculate' }, 'Reset every market term to its seed and replay all priced closes in order?')
              }
            >
              {busy === 'recalc' ? 'Recalculating…' : 'Recalculate'}
            </button>
          </div>
        )}
        {error && <div className="p-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
        {message && <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">{message}</div>}
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {chip('rating', 'Net')}
        {chip('off', 'Offense')}
        {chip('def', 'Defense')}
        {chip('pace', 'Pace')}
        {chip('market', 'Market')}
        {chip('team', 'A–Z')}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="hidden sm:grid grid-cols-[2.5rem_1fr_4.5rem_4.5rem_4.5rem_5rem_3rem] items-center px-3 py-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100">
          <div>#</div>
          <div>Team</div>
          <div className="text-right" title="Offensive plays per game">Pace</div>
          <div className="text-right" title="Points per game vs an average defense at league pace">Off</div>
          <div className="text-right" title="Points allowed per game vs an average offense at league pace">Def</div>
          <div className="text-right" title="Market term (change since seed)">Market</div>
          <div className="text-right" title="Season box scores behind the blend">G</div>
        </div>
        {loading && !data ? (
          <div className="px-4 py-6 text-sm text-slate-500">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-500">
            No totals ratings yet — sync last season&apos;s box scores, then run &quot;Seed Totals&quot;.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((t, i) => {
              const v = visualFor(t.teamName);
              return (
                <div
                  key={t.teamName}
                  className="grid grid-cols-[1.75rem_1fr_auto] sm:grid-cols-[2.5rem_1fr_4.5rem_4.5rem_4.5rem_5rem_3rem] items-center px-2 sm:px-3 py-2"
                  style={{
                    boxShadow: `inset 3px 0 0 ${v.color}`,
                    background: `linear-gradient(90deg, ${v.color}0d, transparent 55%)`,
                  }}
                >
                  <div className="text-xs text-slate-400 tabular-nums">{i + 1}</div>
                  <div className="flex items-center gap-2 min-w-0">
                    {v.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.logo} alt="" className="w-6 h-6 object-contain shrink-0" loading="lazy" />
                    ) : (
                      <span className="w-6 h-6 rounded-full shrink-0" style={{ backgroundColor: `${v.color}33` }} />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{t.teamName}</div>
                      <div className="text-[11px] text-slate-400 truncate sm:hidden tabular-nums">
                        {t.pace.toFixed(1)} plays · off {t.offRating.toFixed(1)} · def {t.defRating.toFixed(1)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right text-sm tabular-nums sm:hidden">{fmtSigned(t.marketTerm)}</div>
                  <div className="hidden sm:block text-right text-sm text-slate-600 tabular-nums">{t.pace.toFixed(1)}</div>
                  <div className="hidden sm:block text-right text-sm text-slate-800 tabular-nums">{t.offRating.toFixed(1)}</div>
                  <div className="hidden sm:block text-right text-sm text-slate-800 tabular-nums">{t.defRating.toFixed(1)}</div>
                  <div className="hidden sm:block text-right text-sm tabular-nums">
                    {fmtSigned(t.marketTerm)}
                    <span className="ml-1 text-[10px] text-slate-400">
                      ({t.marketTerm - t.initialMarketTerm >= 0 ? '+' : ''}
                      {(t.marketTerm - t.initialMarketTerm).toFixed(2)})
                    </span>
                  </div>
                  <div className="hidden sm:block text-right text-sm text-slate-500 tabular-nums">{t.statGames}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-3 sm:px-4 py-3 border-b border-slate-100 text-[16px] font-semibold tracking-[-0.3px] text-slate-700">
          Priced closes
        </div>
        {(data?.adjustments ?? []).length === 0 ? (
          <div className="px-4 py-5 text-sm text-slate-500">No closing totals priced yet.</div>
        ) : (
          <div className="max-h-[55vh] overflow-y-auto divide-y divide-slate-100">
            {data!.adjustments.slice(0, 200).map((a) => (
              <div key={a.gameId} className="px-3 sm:px-4 py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">
                    {a.awayTeam} @ {a.homeTeam}
                  </div>
                  <div className="text-[11px] text-slate-400 tabular-nums">
                    {new Date(a.gameDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    {' · '}{a.playsExpected.toFixed(0)} plays · fundamentals {a.fundTotal.toFixed(1)} + market{' '}
                    {(a.homeTermBefore + a.awayTermBefore).toFixed(1)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-slate-600 tabular-nums whitespace-nowrap">
                    proj {a.projectedTotal.toFixed(1)} {'→'} close {a.closingTotal.toFixed(1)}
                  </div>
                  <div className="text-[11px] tabular-nums">
                    both {fmtSigned(a.adjustment)}
                    <span className="text-slate-400"> · {a.closingSource}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
