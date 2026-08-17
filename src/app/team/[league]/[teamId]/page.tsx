'use client';

// src/app/team/[league]/[teamId]/page.tsx
// Standardized football team page (NCAAF + NFL): identity header themed to
// the team's colors, coach/stadium/conference facts, and the full-season
// schedule with results and current betting lines. [teamId] accepts an ESPN
// numeric id or any common team-name variant (resolved by /api/team-page), so
// links can be built straight from Odds API team strings. Data is live ESPN —
// nothing is stored. This is the template we iterate on.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { fetchOdds, fetchFutures, Game, FuturesMarket } from '@/lib/api';
import { getTeamFEIData, FEITeamData } from '@/lib/feiData';

// League slug → odds-board sport keys to scan for lines on upcoming games.
const LEAGUE_ODDS_KEYS: Record<string, string[]> = {
  ncaaf: ['americanfootball_ncaaf'],
  nfl: ['americanfootball_nfl', 'americanfootball_nfl_preseason'],
};
const FUTURES_KEY: Record<string, string> = { ncaaf: 'americanfootball_ncaaf', nfl: 'americanfootball_nfl' };
const FUTURES_LABEL: Record<string, string> = { ncaaf: 'Championship', nfl: 'Super Bowl' };

interface TeamVenue {
  name: string | null; city: string | null; state: string | null;
  capacity: number | null; grass: boolean | null; indoor: boolean | null; image: string | null;
}
interface TeamInfo {
  id: string; displayName: string; nickname: string | null; abbreviation: string | null;
  location: string | null; logo: string | null; color: string | null; alternateColor: string | null;
  record: string | null; standingSummary: string | null;
  conference: string | null; conferenceShort: string | null;
  coach: string | null; coachSeasons: number | null;
  ats: { season: number; spreadRecord: string; ouRecord: string; games: number } | null;
  leaders: { category: string; athlete: string; position: string | null; value: string; season: number }[];
  injuries: { name: string; position: string | null; status: string }[];
  venue: TeamVenue;
}
interface ScheduleGame {
  id: string; date: string; week: number | null;
  seasonType: 'preseason' | 'regular' | 'postseason';
  home: boolean; neutral: boolean; venue: string | null; tv: string | null;
  opponent: { id: string; name: string; abbreviation: string | null; logo: string | null; rank: number | null };
  state: 'pre' | 'in' | 'post'; completed: boolean; result: 'W' | 'L' | 'T' | null;
  teamScore: string | null; oppScore: string | null; detail: string | null;
  closing: { spread: number | null; atsRes: 'W' | 'L' | 'P' | null; total: number | null; ouRes: 'O' | 'U' | 'P' | null } | null;
}
interface NewsItem { headline: string; url: string | null; published: string | null }
interface TeamPayload { team: TeamInfo; season: number; schedule: ScheduleGame[]; news: NewsItem[] }

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

interface MatchedLines {
  spread: number | null;
  total: number | null;
  ml: number | null;
  oddsId: string;     // Odds API game id → /game/[id] deep link
  sportKey: string;
}

// Median book lines for one scheduled game: the team's spread, the total,
// and the team's moneyline.
function gameLines(odds: Game, teamName: string): MatchedLines {
  const spreads: number[] = [];
  const totals: number[] = [];
  const mls: number[] = [];
  const teamKey = normName(teamName);
  for (const bm of odds.bookmakers ?? []) {
    for (const mkt of bm.markets ?? []) {
      if (mkt.key === 'spreads') {
        const oc = mkt.outcomes?.find((o) => normName(o.name) === teamKey);
        if (oc?.point !== undefined) spreads.push(oc.point);
      } else if (mkt.key === 'totals') {
        const oc = mkt.outcomes?.find((o) => o.name === 'Over');
        if (oc?.point !== undefined) totals.push(oc.point);
      } else if (mkt.key === 'h2h') {
        const oc = mkt.outcomes?.find((o) => normName(o.name) === teamKey);
        if (oc?.price !== undefined) mls.push(oc.price);
      }
    }
  }
  return {
    spread: medianOf(spreads),
    total: medianOf(totals),
    ml: medianOf(mls),
    oddsId: odds.id,
    sportKey: odds.sport_key,
  };
}

const fmtSpread = (n: number): string => (n > 0 ? `+${n}` : `${n}`);
const fmtMl = (n: number): string => {
  const r = Math.round(n);
  return r > 0 ? `+${r}` : `${r}`;
};

// Best (highest-payout) futures price across books for one team entry.
function bestFuturesPrice(markets: FuturesMarket[], teamName: string): { odds: number; book: string } | null {
  const teamKey = normName(teamName);
  let best: { odds: number; book: string } | null = null;
  for (const m of markets) {
    for (const t of m.teams) {
      if (normName(t.team) !== teamKey) continue;
      for (const [book, odds] of Object.entries(t.odds)) {
        const payout = odds > 0 ? 1 + odds / 100 : 1 + 100 / -odds;
        const bestPayout = best ? (best.odds > 0 ? 1 + best.odds / 100 : 1 + 100 / -best.odds) : 0;
        if (payout > bestPayout) best = { odds, book };
      }
    }
  }
  return best;
}


export default function TeamPage() {
  const params = useParams<{ league: string; teamId: string }>();
  const router = useRouter();
  const league = (params?.league ?? '').toLowerCase();
  const teamId = decodeURIComponent(params?.teamId ?? '');
  const leagueSupported = league in LEAGUE_ODDS_KEYS;

  const [data, setData] = useState<TeamPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [odds, setOdds] = useState<Game[]>([]);
  const [futures, setFutures] = useState<FuturesMarket[]>([]);
  const [ratings, setRatings] = useState<{ eckel: number | null; fei: number | null }>({ eckel: null, fei: null });

  useEffect(() => {
    if (!teamId || !leagueSupported) return;
    let cancelled = false;
    setData(null);
    setError(null);
    fetch(`/api/team-page?league=${league}&team=${encodeURIComponent(teamId)}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || `HTTP ${r.status}`);
        if (!cancelled) setData(json);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load team'); });
    return () => { cancelled = true; };
  }, [league, teamId, leagueSupported]);

  // Current odds board + futures prices (server-cached) for the hero card
  // and futures fact.
  useEffect(() => {
    if (!leagueSupported) return;
    let cancelled = false;
    Promise.all(LEAGUE_ODDS_KEYS[league].map((k) => fetchOdds(k))).then((results) => {
      if (!cancelled) setOdds(results.flatMap((r) => r.data));
    });
    fetchFutures(FUTURES_KEY[league]).then((r) => { if (!cancelled) setFutures(r.data); });
    return () => { cancelled = true; };
  }, [league, leagueSupported]);

  useEffect(() => {
    if (data) document.title = `${data.team.displayName} — odds.day`;
  }, [data]);

  // NCAAF analytics ranks from the site's own rating systems.
  useEffect(() => {
    if (league !== 'ncaaf' || !data) return;
    let cancelled = false;
    const name = data.team.displayName;
    fetch(`/api/eckel?teams=${encodeURIComponent(name)}`)
      .then((r) => r.json())
      .then((j) => {
        const rank = j?.matchup?.[0]?.rank ?? null;
        if (!cancelled && typeof rank === 'number') setRatings((p) => ({ ...p, eckel: rank }));
      })
      .catch(() => {});
    fetch('/api/fei-data')
      .then((r) => r.json())
      .then((arr: FEITeamData[]) => {
        if (!Array.isArray(arr)) return;
        const t = getTeamFEIData(name, arr);
        if (!cancelled && t) setRatings((p) => ({ ...p, fei: t.rank }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [league, data]);

  const accent = useMemo(
    () => pickAccent(data?.team.color ?? null, data?.team.alternateColor ?? null),
    [data]
  );

  const futuresBest = useMemo(
    () => (data ? bestFuturesPrice(futures, data.team.displayName) : null),
    [futures, data]
  );

  // Match schedule games to the odds board by both team names.
  const linesByGameId = useMemo(() => {
    const map = new Map<string, MatchedLines>();
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

  if (!leagueSupported) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-sm text-red-600 mb-3">Team pages aren&apos;t available for “{league}” yet.</div>
          <button onClick={() => router.push('/')} className="text-sm text-blue-600 hover:underline">← Back to odds</button>
        </div>
      </div>
    );
  }
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
  const groupLabel = league === 'nfl' ? 'Division' : 'Conference';
  const postLabel = league === 'nfl' ? 'Post' : 'Bowl';
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
  if (team.conference) facts.push([groupLabel, team.conference]);
  if (team.ats) {
    facts.push([`ATS · O/U (${team.ats.season})`, `${team.ats.spreadRecord} · ${team.ats.ouRecord}`]);
  }
  if (futuresBest) facts.push([FUTURES_LABEL[league], `${fmtMl(futuresBest.odds)} · ${futuresBest.book}`]);
  if (ratings.eckel !== null) facts.push(['Eckel Rating', `#${ratings.eckel}`]);
  if (ratings.fei !== null) facts.push(['FEI Rating', `#${ratings.fei}`]);

  // Last 5 completed games, oldest → newest, plus the active streak
  const completedGames = schedule.filter((g) => g.completed && g.result);
  const form = completedGames.slice(-5);
  let streak = 0;
  for (let i = completedGames.length - 1; i >= 0; i--) {
    if (completedGames[i].result === completedGames[completedGames.length - 1].result) streak++;
    else break;
  }
  const streakLabel = completedGames.length
    ? `${completedGames[completedGames.length - 1].result === 'W' ? 'Won' : completedGames[completedGames.length - 1].result === 'L' ? 'Lost' : 'Tied'} ${streak}`
    : null;

  const nextGame = schedule.find((g) => g.state === 'pre') ?? null;
  const nextLines = nextGame ? linesByGameId.get(nextGame.id) : null;
  const daysToNext = nextGame
    ? Math.max(0, Math.round((new Date(nextGame.date).getTime() - Date.now()) / 86400000))
    : 0;

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
              {(team.conferenceShort ?? team.conference) && (
                <span className="inline-flex mt-2 px-2 py-0.5 rounded-full bg-white/15 text-white text-xs font-medium">
                  {team.conferenceShort ?? team.conference}
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
            {team.venue.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={team.venue.image}
                alt={team.venue.name ?? ''}
                className="w-full h-36 sm:h-48 object-cover rounded-lg mb-3"
              />
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
              {facts.map(([label, value]) => (
                <div key={label}>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
                  <div className="text-sm font-medium text-slate-800">{value}</div>
                </div>
              ))}
            </div>
            {form.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Form</span>
                <span className="flex gap-1">
                  {form.map((g) => (
                    <span
                      key={g.id}
                      title={`${g.home ? 'vs' : '@'} ${g.opponent.name} ${g.teamScore}–${g.oppScore}`}
                      className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold text-white ${
                        g.result === 'W' ? 'bg-emerald-500' : g.result === 'L' ? 'bg-red-500' : 'bg-slate-400'
                      }`}
                    >
                      {g.result}
                    </span>
                  ))}
                </span>
                {streakLabel && <span className="text-xs text-slate-500">{streakLabel}</span>}
              </div>
            )}
          </div>
        )}

        {/* Team leaders + news */}
        {(team.leaders.length > 0 || data.news.length > 0) && (
          <div className="grid sm:grid-cols-2 gap-4">
            {team.leaders.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  Team Leaders ({team.leaders[0].season})
                </div>
                <div className="space-y-2">
                  {team.leaders.map((l) => (
                    <div key={l.category} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mr-2">{l.category}</span>
                        <span className="text-sm font-medium truncate">{l.athlete}</span>
                        {l.position && <span className="ml-1 text-[10px] text-slate-400">{l.position}</span>}
                      </div>
                      <span className="text-sm tabular-nums text-slate-600 shrink-0">{l.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {data.news.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">News</div>
                <div className="space-y-2">
                  {data.news.map((n) => (
                    <div key={n.headline} className="flex items-baseline gap-2">
                      {n.published && (
                        <span className="shrink-0 text-[10px] text-slate-400 tabular-nums">
                          {new Date(n.published).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                      {n.url ? (
                        <a href={n.url} target="_blank" rel="noopener noreferrer" className="text-sm hover:underline" style={{ color: accent }}>
                          {n.headline}
                        </a>
                      ) : (
                        <span className="text-sm">{n.headline}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Next game hero */}
        {nextGame && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4" style={{ borderLeft: `4px solid ${accent}` }}>
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Next Game{daysToNext > 0 ? ` · in ${daysToNext}d` : ' · today'}
              </div>
              {nextLines && (
                <Link
                  href={`/game/${nextLines.oddsId}?league=${nextLines.sportKey}`}
                  className="text-xs font-medium hover:underline"
                  style={{ color: accent }}
                >
                  Full odds →
                </Link>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Link href={`/team/${league}/${nextGame.opponent.id}`} className="flex items-center gap-2 group">
                {nextGame.opponent.logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={nextGame.opponent.logo} alt="" className="w-8 h-8" />
                )}
                <span className="text-sm font-semibold group-hover:underline">
                  <span className="text-slate-400 font-normal mr-1">{nextGame.home || nextGame.neutral ? 'vs' : '@'}</span>
                  {nextGame.opponent.rank && <span className="text-[10px] text-slate-500 mr-1">#{nextGame.opponent.rank}</span>}
                  {nextGame.opponent.name}
                </span>
              </Link>
              <span className="text-xs text-slate-500 tabular-nums">
                {new Date(nextGame.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                {' · '}
                {new Date(nextGame.date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                {nextGame.tv && ` · ${nextGame.tv}`}
              </span>
              {nextLines && (nextLines.spread !== null || nextLines.ml !== null || nextLines.total !== null) && (
                <span className="flex items-center gap-1.5">
                  {nextLines.spread !== null && (
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-xs font-semibold tabular-nums">{fmtSpread(nextLines.spread)}</span>
                  )}
                  {nextLines.ml !== null && (
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-xs font-semibold tabular-nums">ML {fmtMl(nextLines.ml)}</span>
                  )}
                  {nextLines.total !== null && (
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-xs font-semibold tabular-nums">O/U {nextLines.total}</span>
                  )}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Injuries */}
        {team.injuries.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Injuries</div>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
              {team.injuries.map((inj) => (
                <div key={`${inj.name}-${inj.status}`} className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">
                    {inj.name}
                    {inj.position && <span className="ml-1 text-[10px] text-slate-400">{inj.position}</span>}
                  </span>
                  <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                    /(out|injured reserve|ir)/i.test(inj.status) ? 'bg-red-100 text-red-700'
                      : /doubtful/i.test(inj.status) ? 'bg-orange-100 text-orange-700'
                      : /questionable|day/i.test(inj.status) ? 'bg-amber-100 text-amber-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    {inj.status}
                  </span>
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
                      <div className="text-[10px] uppercase text-slate-400">
                        {g.seasonType === 'postseason' ? postLabel
                          : g.seasonType === 'preseason' ? 'Pre'
                          : `Wk ${g.week ?? '—'}`}
                      </div>
                      <div className="text-xs font-medium text-slate-600">
                        {d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                    <Link
                      href={`/team/${league}/${g.opponent.id}`}
                      className="flex items-center gap-1.5 min-w-0 flex-1 group"
                    >
                      {/* Mobile shows "@ (icon)" for road games, just "(icon)" at home
                          (fixed-width slot keeps the icons aligned); the full name is sm+ only */}
                      <span className="w-5 shrink-0 text-right text-sm text-slate-400">
                        {g.home || g.neutral ? <span className="hidden sm:inline">vs</span> : '@'}
                      </span>
                      {g.opponent.logo && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={g.opponent.logo} alt={g.opponent.name} className="w-6 h-6 shrink-0" />
                      )}
                      <span className="hidden sm:block text-sm truncate">
                        {g.opponent.rank && <span className="text-[10px] font-semibold text-slate-500 mr-1">#{g.opponent.rank}</span>}
                        <span className="font-medium group-hover:underline">{g.opponent.name}</span>
                        {g.neutral && <span className="ml-1 text-[10px] text-slate-400">(neutral)</span>}
                      </span>
                    </Link>
                    <div className="shrink-0 text-right">
                      {g.completed && g.result ? (
                        <div>
                          <span className={`text-sm font-semibold tabular-nums ${g.result === 'W' ? 'text-emerald-600' : g.result === 'L' ? 'text-red-600' : 'text-slate-500'}`}>
                            {g.result} {g.teamScore}–{g.oppScore}
                          </span>
                          {g.closing && (g.closing.atsRes || g.closing.ouRes) && (
                            <div className="text-[10px] tabular-nums text-slate-500">
                              {g.closing.spread !== null && g.closing.atsRes && (
                                <span className={g.closing.atsRes === 'W' ? 'text-emerald-600' : g.closing.atsRes === 'L' ? 'text-red-500' : ''}>
                                  {fmtSpread(g.closing.spread)} {g.closing.atsRes === 'W' ? '✓' : g.closing.atsRes === 'L' ? '✗' : '='}
                                </span>
                              )}
                              {g.closing.spread !== null && g.closing.atsRes && g.closing.total !== null && g.closing.ouRes && ' · '}
                              {g.closing.total !== null && g.closing.ouRes && (
                                <span>{g.closing.ouRes === 'P' ? 'Push' : g.closing.ouRes} {g.closing.total}</span>
                              )}
                            </div>
                          )}
                        </div>
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
          Live from ESPN · lines are the median book spread/total from the current odds board ·
          per-game ✓/✗ = against the closing spread · times local.
        </div>
      </div>
    </div>
  );
}
