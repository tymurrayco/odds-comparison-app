'use client';

// src/components/NflSurvivorPanel.tsx
// Survivor tab on the NFL admin page. One entry per league, each with its
// own picks and double-pick weeks: switch entries at the top, add one with
// a name and its double weeks. Per week: your pick(s) (saved), the planner's
// recommended path for every open slot from the Ledger win probabilities,
// and a home-teams-only toggle. A team you have already picked this week in
// another entry is flagged (both leagues ride the same game) — never blocked.

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
  alsoIn: string[];
}
interface Pick {
  week: number;
  slot: number;
  team: string;
  result: 'won' | 'lost' | 'pending' | 'unknown';
  option: Option | null;
  alsoIn: string[];
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
interface Rules {
  doubleWeeks: number[];
  weeks: number;
}
interface EntryInfo {
  entry: string;
  label: string;
  rules: Rules;
}
interface Plan {
  success: boolean;
  error?: string;
  season: number;
  entry: string;
  label: string;
  rules: Rules;
  entries: EntryInfo[];
  currentWeek: number;
  homeOnly: boolean;
  weeks: Week[];
  usedTeams: string[];
  survivalProb: number | null;
  infeasible: string[];
  picksError: string | null;
  entriesError: string | null;
}

export interface TeamVisual {
  logo: string | null;
  color: string;
  href?: string | null;
}

const pct = (p: number) => `${(p * 100).toFixed(0)}%`;
const spreadTxt = (s: number) => (s === 0 ? 'PK' : s > 0 ? `+${s.toFixed(1)}` : s.toFixed(1));
const short = (name: string) => name.split(' ').pop() ?? name;

/** "3, 6, 9 and 12–16" */
function weekList(weeks: number[]): string {
  if (weeks.length === 0) return 'none';
  const runs: string[] = [];
  let start = weeks[0];
  let prev = weeks[0];
  for (let i = 1; i <= weeks.length; i++) {
    const w = weeks[i];
    if (w === prev + 1) { prev = w; continue; }
    runs.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = w; prev = w;
  }
  return runs.length > 1 ? `${runs.slice(0, -1).join(', ')} and ${runs[runs.length - 1]}` : runs[0];
}

/** "3,6,9,12-16" -> [3,6,9,12,13,14,15,16] */
function parseWeeks(text: string): number[] {
  const out = new Set<number>();
  for (const part of text.split(/[,\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)\s*[-–]\s*(\d+)$/);
    if (m) {
      for (let w = Number(m[1]); w <= Number(m[2]); w++) out.add(w);
    } else if (/^\d+$/.test(part)) {
      out.add(Number(part));
    }
  }
  return [...out].filter((w) => w >= 1 && w <= 18).sort((a, b) => a - b);
}

const ENTRY_KEY = 'nfl-survivor-entry';

export default function NflSurvivorPanel({ visualFor }: { visualFor: (teamName: string) => TeamVisual }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [homeOnly, setHomeOnly] = useState(false);
  const [entry, setEntry] = useState<string | null>(() => {
    try { return localStorage.getItem(ENTRY_KEY); } catch { return null; }
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [showAll, setShowAll] = useState<Record<number, boolean>>({});
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newWeeks, setNewWeeks] = useState('');

  const load = useCallback(async (ho: boolean, en: string | null) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (ho) params.set('homeOnly', '1');
      if (en) params.set('entry', en);
      const qs = params.toString();
      const res = await fetch(`/api/nfl/survivor${qs ? `?${qs}` : ''}`);
      const json: Plan = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setPlan(json);
      if (json.entry !== en) {
        setEntry(json.entry);
        try { localStorage.setItem(ENTRY_KEY, json.entry); } catch { /* per-viewer convenience only */ }
      }
      setError(
        json.picksError
          ? `Picks can't be saved yet: ${json.picksError} (run sql/nfl_survivor.sql)`
          : json.entriesError
            ? 'Single entry until sql/nfl_survivor_entries.sql is run in Supabase.'
            : null
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(homeOnly, entry);
  }, [load, homeOnly, entry]);

  const pickEntry = (en: string) => {
    setEntry(en);
    try { localStorage.setItem(ENTRY_KEY, en); } catch { /* ignore */ }
  };

  const savePick = async (week: number, slot: number, team: string | null) => {
    setSaving(`${week}-${slot}`);
    setError(null);
    try {
      const res = await fetch('/api/nfl/survivor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week, slot, team, entry: plan?.entry ?? entry }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      await load(homeOnly, plan?.entry ?? entry);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save pick');
    } finally {
      setSaving(null);
    }
  };

  const createEntry = async () => {
    const label = newLabel.trim();
    if (!label) return;
    setSaving('entry');
    setError(null);
    try {
      const res = await fetch('/api/nfl/survivor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'createEntry', entry: label, label, doubleWeeks: parseWeeks(newWeeks) }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setAdding(false);
      setNewLabel('');
      setNewWeeks('');
      pickEntry(json.created.entry);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create entry');
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

  const AlsoIn = ({ labels }: { labels: string[] }) =>
    labels.length ? (
      <span
        className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 shrink-0"
        title={`Also your pick this week in ${labels.join(', ')} — one loss takes out both entries`}
      >
        also {labels.map(short).join(', ')}
      </span>
    ) : null;

  const OptionLine = ({ o, tag }: { o: Option; tag?: string }) => (
    <div className="flex items-center gap-2 min-w-0 text-sm">
      <Logo team={o.team} />
      <span className="font-medium text-slate-800 truncate">{o.team}</span>
      <span className="text-slate-400 text-xs truncate">
        {o.neutral ? 'vs' : o.home ? 'vs' : '@'} {short(o.opponent)} · {spreadTxt(o.spread)}
      </span>
      <AlsoIn labels={o.alsoIn} />
      <span className="ml-auto text-sm font-semibold tabular-nums text-slate-800">{pct(o.prob)}</span>
      {tag && <span className="text-[10px] uppercase tracking-wide text-emerald-600 font-semibold">{tag}</span>}
    </div>
  );

  const entries = plan?.entries ?? [];
  const rules = plan?.rules;

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 space-y-2">
        {entries.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex bg-slate-200/70 rounded-full p-0.5">
              {entries.map((e) => (
                <button
                  key={e.entry}
                  type="button"
                  onClick={() => pickEntry(e.entry)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                    (plan?.entry ?? entry) === e.entry ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  {e.label}
                </button>
              ))}
            </div>
            {!plan?.entriesError && (
              <button type="button" className="text-xs text-slate-500 underline" onClick={() => setAdding((a) => !a)}>
                {adding ? 'cancel' : '+ entry'}
              </button>
            )}
          </div>
        )}
        {adding && (
          <div className="flex flex-wrap items-end gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200">
            <label className="text-xs text-slate-600">
              <div className="mb-0.5">League name</div>
              <input
                className="px-2 py-1.5 text-sm bg-white border border-slate-200 rounded-lg"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Office pool"
              />
            </label>
            <label className="text-xs text-slate-600">
              <div className="mb-0.5">Double-pick weeks</div>
              <input
                className="px-2 py-1.5 text-sm bg-white border border-slate-200 rounded-lg w-40"
                value={newWeeks}
                onChange={(e) => setNewWeeks(e.target.value)}
                placeholder="e.g. 3,6,9,12-16"
              />
            </label>
            <button
              type="button"
              className="px-3 py-1.5 text-sm font-medium rounded-lg bg-slate-800 text-white disabled:opacity-50"
              disabled={saving === 'entry' || !newLabel.trim()}
              onClick={createEntry}
            >
              {saving === 'entry' ? '…' : 'Add'}
            </button>
            <span className="text-[11px] text-slate-400">
              Weeks parsed: {parseWeeks(newWeeks).length ? weekList(parseWeeks(newWeeks)) : 'single pick every week'}
            </span>
          </div>
        )}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[16px] font-semibold tracking-[-0.3px] text-slate-700">
              Survivor — {plan?.label ?? '…'}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              One pick a week{rules && rules.doubleWeeks.length ? `; two picks in weeks ${weekList(rules.doubleWeeks)}` : ''}; picks lock at
              kickoff. Each team once per entry. Win probabilities from the Ledger spread (σ 13). The path below assigns
              unused teams to your open slots to maximise the chance of surviving every remaining week. A team you
              already picked this week in another entry is flagged, not blocked.
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
          // Every required pick came home: tint the card green
          const survived = w.picks.length >= w.required && w.picks.every((p) => p.result === 'won');
          return (
            <div
              key={w.week}
              className={`rounded-xl border overflow-hidden ${
                survived ? 'bg-emerald-50 border-emerald-200' : isCurrent ? 'bg-white border-[#0052ff]' : 'bg-white border-slate-200'
              } ${w.locked && !isCurrent && !survived ? 'opacity-80' : ''}`}
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
                              {o.alsoIn.length ? ` · also ${o.alsoIn.join(', ')}` : ''}
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
                      {mine && <AlsoIn labels={mine.alsoIn} />}
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
