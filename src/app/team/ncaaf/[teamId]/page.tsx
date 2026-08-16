'use client';

// src/app/team/ncaaf/[teamId]/page.tsx
// Standardized college-football team page: identity header themed to the
// team's colors, coach/stadium/conference facts, and the full-season schedule
// with results and current betting lines. [teamId] accepts an ESPN numeric id
// or any common team-name variant (resolved by /api/cfb-team), so links can
// be built straight from Odds API team strings. Data is live ESPN — nothing
// is stored. This is v1 of a template we iterate on.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { fetchOdds, Game } from '@/lib/api';

interface TeamVenue {
  name: string | null; city: string | null; state: string | null;
  capacity: number | null; grass: boolean | null; indoor: boolean | null; image: string | null;
}
interface TeamInfo {
  id: string; displayName: string; nickname: string | null; abbreviation: string | null;
  location: string | null; logo: string | null; color: string | null; alternateColor: string | null;
  record: string | null; standingSummary: string | null;
  conference: string | null; conferenceShort: string | null;
  coach: string | null; coachSeasons: number | null; venue: TeamVenue;
}
interface ScheduleGame {
  id: string; date: string; week: number | null; seasonType: 'regular' | 'postseason';
  home: boolean; neutral: boolean; venue: string | null; tv: string | null;
  opponent: { id: string; name: string; abbreviation: string | null; logo: string | null; rank: number | null };
  state: 'pre' | 'in' | 'post'; completed: boolean; result: 'W' | 'L' | 'T' | null;
  teamScore: string | null; oppScore: string | null; detail: string | null;
}
interface TeamPayload { team: TeamInfo; season: number; schedule: ScheduleGame[] }

const normName = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Team color as a header background: reject colors too dark or too light to
// carry white text, falling back to the alternate then a neutral slate.
const hexLuminance = (hex: string): number | null => {
  const h = hex.replace('#', '').trim();
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return null;
  return 0.299 * r + 0.587 * g + 0.114 * b;
};
const pickAccent = (color: string | null, alt: string | null): string => {
  for (const c of [color, alt]) {
    if (!c) continue;
    const lum = hexLuminance(c);
    if (lum !== null && lum >= 30 && lum <= 190) return `#${c.replace('#', '')}`;
  }
  return '#1e293b';
};

const medianOf = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// Median book line for one scheduled game: the team's spread + the total.
function gameLines(odds: Game, teamName: string): { spread: number | null; total: number | null } {
  const spreads: number[] = [];
  const totals: number[] = [];
  const teamKey = normName(teamName);
  for (const bm of odds.bookmakers ?? []) {
    for (const mkt of bm.markets ?? []) {
      if (mkt.key === 'spreads') {
        const oc = mkt.outcomes?.find((o) => normName(o.name) === teamKey);
        if (oc?.point !== undefined) spreads.push(oc.point);
      } else if (mkt.key === 'totals') {
        const oc = mkt.outcomes?.find((o) => o.name === 'Over');
        if (oc?.point !== undefined) totals.push(oc.point);
      }
    }
  }
  return { spread: medianOf(spreads), total: medianOf(totals) };
}

const fmtSpread = (n: number): string => (n > 0 ? `+${n}` : `${n}`);

export default function CfbTeamPage() {
  const params = useParams<{ teamId: string }>();
  const router = useRouter();
  const teamId = decodeURIComponent(params?.teamId ?? '');

  const [data, setData] = useState<TeamPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [odds, setOdds] = useState<Game[]>([]);

  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    setData(null);
    setError(null);
    fetch(`/api/cfb-team?team=${encodeURIComponent(teamId)}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || `HTTP ${r.status}`);
        if (!cancelled) setData(json);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load team'); });
    return () => { cancelled = true; };
  }, [teamId]);

  // Current NCAAF board (server-cached) for lines on upcoming games.
  useEffect(() => {
    let cancelled = false;
    fetchOdds('americanfootball_ncaaf').then((r) => { if (!cancelled) setOdds(r.data); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (data) document.title = `${data.team.displayName} — odds.day`;
  }, [data]);

  const accent = useMemo(
    () => pickAccent(data?.team.color ?? null, data?.team.alternateColor ?? null),
    [data]
  );

  // Match schedule games to the odds board by both team names.
  const linesByGameId = useMemo(() => {
    const map = new Map<string, { spread: number | null; total: number | null }>();
    if (!data || !odds.length) return map;
    const usKey = normName(data.team.displayName);
    for (const g of data.schedule) {
      if (g.state !== 'pre') continue;
      const oppKey = normName(g.opponent.name);
      const match = odds.find((o) => {
        const h = normName(o.home_team), a = normName(o.away_team);
        return (h === usKey && a === oppKey) || (h === oppKey && a === usKey);
      });
      if (match) map.set(g.id, gameLines(match, data.team.displayName));
    }
    return map;
  }, [data, odds]);

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-sm text-red-600 mb-3">{error}</div>
          <button onClick={() => router.push('/')} className="text-sm text-blue-600 hover:underline">← Back to odds</button>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-400 animate-pulse">Loading team…</div>
      </div>
    );
  }

  const { team, season, schedule } = data;
  const facts: [string, string][] = [];
  if (team.coach) facts.push(['Head Coach', team.coach + (team.coachSeasons ? ` · ${team.coachSeasons}${['st', 'nd', 'rd'][team.coachSeasons - 1] ?? 'th'} season` : '')]);
  if (team.venue.name) {
    facts.push(['Stadium', team.venue.name]);
    const loc = [team.venue.city, team.venue.state].filter(Boolean).join(', ');
    if (loc) facts.push(['Location', loc]);
    if (team.venue.capacity) facts.push(['Capacity', team.venue.capacity.toLocaleString()]);
    const surface = team.venue.grass === null ? null : team.venue.grass ? 'Grass' : 'Turf';
    if (surface) facts.push(['Surface', surface + (team.venue.indoor ? ' · Indoor' : '')]);
  }
  if (team.conference) facts.push(['Conference', team.conference]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Themed header */}
      <div style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)` }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          <button onClick={() => router.back()} className="text-white/70 hover:text-white text-xs mb-3 inline-flex items-center gap-1">
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            Back
          </button>
          <div className="flex items-center gap-4">
            {team.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={team.logo} alt="" className="w-20 h-20 sm:w-24 sm:h-24 drop-shadow-lg" />
            )}
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">{team.displayName}</h1>
              <div className="text-white/85 text-sm mt-1 flex flex-wrap items-center gap-x-2">
                {team.record && <span className="font-semibold">{team.record}</span>}
                {team.standingSummary && <span>· {team.standingSummary}</span>}
              </div>
              {team.conferenceShort && (
                <span className="inline-flex mt-2 px-2 py-0.5 rounded-full bg-white/15 text-white text-xs font-medium">
                  {team.conferenceShort}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 space-y-4">
        {/* Facts */}
        {facts.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
              {facts.map(([label, value]) => (
                <div key={label}>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
                  <div className="text-sm font-medium text-slate-800">{value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Schedule */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
            {season} Schedule
          </div>
          {schedule.length === 0 ? (
            <div className="text-sm text-slate-400 py-4 text-center">Schedule not published yet.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {schedule.map((g) => {
                const d = new Date(g.date);
                const lines = linesByGameId.get(g.id);
                return (
                  <div key={g.id} className="flex items-center gap-3 py-2.5">
                    <div className="w-10 shrink-0 text-center">
                      <div className="text-[10px] uppercase text-slate-400">{g.seasonType === 'postseason' ? 'Bowl' : `Wk ${g.week ?? '—'}`}</div>
                      <div className="text-xs font-medium text-slate-600">
                        {d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                    <Link
                      href={`/team/ncaaf/${g.opponent.id}`}
                      className="flex items-center gap-2 min-w-0 flex-1 group"
                    >
                      {g.opponent.logo && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={g.opponent.logo} alt="" className="w-6 h-6 shrink-0" />
                      )}
                      <span className="text-sm truncate">
                        <span className="text-slate-400 mr-1">{g.neutral ? 'vs' : g.home ? 'vs' : '@'}</span>
                        {g.opponent.rank && <span className="text-[10px] font-semibold text-slate-500 mr-1">#{g.opponent.rank}</span>}
                        <span className="font-medium group-hover:underline">{g.opponent.name}</span>
                        {g.neutral && <span className="ml-1 text-[10px] text-slate-400">(neutral)</span>}
                      </span>
                    </Link>
                    <div className="shrink-0 text-right">
                      {g.completed && g.result ? (
                        <span className={`text-sm font-semibold tabular-nums ${g.result === 'W' ? 'text-emerald-600' : g.result === 'L' ? 'text-red-600' : 'text-slate-500'}`}>
                          {g.result} {g.teamScore}–{g.oppScore}
                        </span>
                      ) : g.state === 'in' ? (
                        <span className="text-sm font-semibold text-emerald-600">{g.detail ?? 'Live'} {g.teamScore}–{g.oppScore}</span>
                      ) : (
                        <div>
                          <div className="text-xs text-slate-600 tabular-nums">
                            {d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                            {g.tv && <span className="text-slate-400"> · {g.tv}</span>}
                          </div>
                          {lines && (lines.spread !== null || lines.total !== null) && (
                            <div className="text-[11px] font-medium tabular-nums" style={{ color: accent }}>
                              {lines.spread !== null && fmtSpread(lines.spread)}
                              {lines.spread !== null && lines.total !== null && ' · '}
                              {lines.total !== null && `O/U ${lines.total}`}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="text-[11px] text-slate-400 pb-6">
          Live from ESPN · lines are the median book spread/total from the current odds board · times local.
        </div>
      </div>
    </div>
  );
}
