'use client';

// src/components/NflSurvivorPanel.tsx
// Survivor tab on the NFL admin page: your pick(s) per week (saved), the
// planner's recommended path for every open slot from the Ledger win
// probabilities, and a home-teams-only toggle. Double-pick weeks (9, 12–16)
// show two slots.

import { useCallback, useEffect, useState } from 'react';

interface Option {
  team: string;
  opponent: string;
  home: boolean;
  neutral: boolean;
  prob: number;
  spread: number;
  gameId: string;
  date: string;
  started: boolean;
}
interface Pick {
  week: number;
  slot: number;
  team: string;
  result: 'won' | 'lost' | 'pending' | 'unknown';
  option: Option | null;
}
interface Week {
  week: number;
  required: number;
  picks: Pick[];
  recommended: Option[];
  options: Option[];
  locked: boolean;
  weekProb: number | null;
}
interface Plan {
  success: boolean;
  error?: string;
  season: number;
  currentWeek: number;
  homeOnly: boolean;
  weeks: Week[];
  usedTeams: string[];
  survivalProb: number | null;
  infeasible: string[];
  picksError: string | null;
}

export interface TeamVisual {
  logo: string | null;
  color: string;
  href?: string | null;
}

const pct = (p: number) => `${(p * 100).toFixed(0)}%`;
const spreadTxt = (s: number) => (s === 0 ? 'PK' : s > 0 ? `+${s.toFixed(1)}` : s.toFixed(1));
const short = (name: string) => name.split(' ').pop() ?? name;

export default function NflSurvivorPanel({ visualFor }: { visualFor: (teamName: string) => TeamVisual }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [homeOnly, setHomeOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [showAll, setShowAll] = useState<Record<number, boolean>>({});

  const load = useCallback(async (ho: boolean) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/nfl/survivor${ho ? '?homeOnly=1' : ''}`);
      const json: Plan = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setPlan(json);
      setError(json.picksError ? `Picks can't be saved yet: ${json.picksError} (run sql/nfl_survivor.sql)` : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(homeOnly);
  }, [load, homeOnly]);

  const savePick = async (week: number, slot: number, team: string | null) => {
    setSaving(`${week}-${slot}`);
    setError(null);
    try {
      const res = await fetch('/api/nfl/survivor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week, slot, team }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      await load(homeOnly);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save pick');
    } finally {
      setSaving(null);
    }
  };

  const Logo = ({ team }: { team: string }) => {
    const v = visualFor(team);
    return v.logo ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={v.logo} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />
    ) : (
      <span className="w-5 h-5 rounded-full shrink-0" style={{ backgroundColor: `${v.color}33` }} />
    );
  };

  const OptionLine = ({ o, tag }: { o: Option; tag?: string }) => (
    <div className="flex items-center gap-2 min-w-0 text-sm">
      <Logo team={o.team} />
      <span className="font-medium text-slate-800 truncate">{o.team}</span>
      <span className="text-slate-400 text-xs truncate">
        {o.neutral ? 'vs' : o.home ? 'vs' : '@'} {short(o.opponent)} · {spreadTxt(o.spread)}
      </span>
      <span className="ml-auto text-sm font-semibold tabular-nums text-slate-800">{pct(o.prob)}</span>
      {tag && <span className="text-[10px] uppercase tracking-wide text-emerald-600 font-semibold">{tag}</span>}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[16px] font-semibold tracking-[-0.3px] text-slate-700">Survivor — Splash × Polymarket</div>
            <div className="text-xs text-slate-500 mt-0.5">
              One pick a week; two picks in weeks 9 and 12–16; picks lock Sunday 1pm ET. Each team once. Win
              probabilities from the Ledger spread (σ 13). The path below assigns unused teams to your open slots to
              maximise the chance of surviving every remaining week.
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600 shrink-0 cursor-pointer select-none">
            <input type="checkbox" checked={homeOnly} onChange={(e) => setHomeOnly(e.target.checked)} className="h-4 w-4" />
            Home teams only
          </label>
        </div>
        {plan && (
          <div className="text-xs text-slate-500 tabular-nums">
            Week {plan.currentWeek} now · used: {plan.usedTeams.length ? plan.usedTeams.map(short).join(', ') : 'none yet'}
            {plan.survivalProb !== null && (
              <> · <span className="font-semibold text-slate-700">survive the season: {(plan.survivalProb * 100).toFixed(1)}%</span></>
            )}
            {plan.infeasible.length > 0 && <span className="text-amber-600"> · no team available for {plan.infeasible.join(', ')}</span>}
          </div>
        )}
        {error && <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700">{error}</div>}
      </div>

      {loading && !plan ? (
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-6 text-sm text-slate-500">Planning…</div>
      ) : (
        (plan?.weeks ?? []).map((w) => {
          const isCurrent = w.week === plan!.currentWeek;
          const open = !w.locked;
          const usedElsewhere = new Set(plan!.usedTeams);
          for (const p of w.picks) usedElsewhere.delete(p.team);
          const eligible = w.options.filter((o) => !usedElsewhere.has(o.team) && !o.started && (!homeOnly || o.home));
          const alt = eligible.slice(0, showAll[w.week] ? eligible.length : 5);
          return (
            <div
              key={w.week}
              className={`bg-white rounded-xl border overflow-hidden ${isCurrent ? 'border-[#0052ff]' : 'border-slate-200'} ${w.locked && !isCurrent ? 'opacity-80' : ''}`}
            >
              <div className="px-3 sm:px-4 py-2.5 flex items-center justify-between gap-2 border-b border-slate-100">
                <div className="text-sm font-semibold text-slate-800">
                  Week {w.week}
                  {w.required === 2 && <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-violet-600">two picks</span>}
                  {isCurrent && <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#0052ff]">this week</span>}
                  {w.locked && !isCurrent && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-slate-400">done</span>}
                </div>
                {w.weekProb !== null && (
                  <div className="text-xs tabular-nums text-slate-500">
                    week {w.weekProb === 1 ? 'survived' : w.weekProb === 0 ? 'lost' : pct(w.weekProb)}
                  </div>
                )}
              </div>
              <div className="px-3 sm:px-4 py-2.5 space-y-2">
                {/* Your picks: one select per slot */}
                {Array.from({ length: w.required }, (_, i) => i + 1).map((slot) => {
                  const mine = w.picks.find((p) => p.slot === slot);
                  const rec = mine ? null : w.recommended[slot - 1 - w.picks.filter((p) => p.slot < slot).length] ?? null;
                  return (
                    <div key={slot} className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] uppercase tracking-wide text-slate-400 w-12 shrink-0">
                        {w.required === 2 ? `Pick ${slot}` : 'Pick'}
                      </span>
                      {mine && <Logo team={mine.team} />}
                      <select
                        className="px-2 py-1.5 text-sm bg-white border border-slate-200 rounded-lg min-w-0 flex-1 max-w-xs"
                        value={mine?.team ?? ''}
                        disabled={saving === `${w.week}-${slot}`}
                        onChange={(e) => savePick(w.week, slot, e.target.value || null)}
                      >
                        <option value="">{rec ? `— planner: ${rec.team} (${pct(rec.prob)}) —` : '— none —'}</option>
                        {w.options
                          .filter((o) => o.team === mine?.team || !usedElsewhere.has(o.team))
                          .map((o) => (
                            <option key={o.team} value={o.team}>
                              {o.team} {o.home ? 'vs' : '@'} {short(o.opponent)} · {spreadTxt(o.spread)} · {pct(o.prob)}
                            </option>
                          ))}
                      </select>
                      {mine && (
                        <span
                          className={`text-xs font-semibold tabular-nums ${
                            mine.result === 'won' ? 'text-emerald-600' : mine.result === 'lost' ? 'text-red-600' : 'text-slate-500'
                          }`}
                        >
                          {mine.result === 'won' ? '✓ won' : mine.result === 'lost' ? '✗ lost' : mine.option ? `${pct(mine.option.prob)} · ${spreadTxt(mine.option.spread)}` : ''}
                        </span>
                      )}
                      {mine && open && (
                        <button className="text-[11px] text-slate-400 underline" onClick={() => savePick(w.week, slot, null)}>
                          clear
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* Planner + alternatives for open weeks */}
                {open && (
                  <div className="pt-1.5 border-t border-slate-100 space-y-1">
                    {w.recommended.length > 0 && (
                      <div className="text-[11px] uppercase tracking-wide text-slate-400">Planner</div>
                    )}
                    {w.recommended.map((o) => (
                      <OptionLine key={`rec-${o.team}`} o={o} tag="path" />
                    ))}
                    <div className="text-[11px] uppercase tracking-wide text-slate-400 pt-1">
                      Best available {homeOnly ? '(home)' : ''}
                    </div>
                    {alt.map((o) => (
                      <OptionLine key={o.team} o={o} />
                    ))}
                    {eligible.length > 5 && (
                      <button
                        className="text-[11px] text-slate-400 underline"
                        onClick={() => setShowAll((s) => ({ ...s, [w.week]: !s[w.week] }))}
                      >
                        {showAll[w.week] ? 'fewer' : `all ${eligible.length}`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
