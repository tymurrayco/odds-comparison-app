// src/lib/myGameBets.tsx
// Shared lookup of the user's pending bets for game-header and futures badges.
// Fetches once per page load (module-level cache) so every card/table
// shares a single Supabase query.
'use client';

import { useEffect, useState } from 'react';
import { fetchBets, Bet } from './betService';

export const normalizeTeamKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const norm = normalizeTeamKey;

let pendingBetsPromise: Promise<Bet[]> | null = null;

function loadPendingBets(): Promise<Bet[]> {
  if (!pendingBetsPromise) {
    pendingBetsPromise = fetchBets()
      .then(bets => bets.filter(b => b.status === 'pending'))
      .catch(() => []);
  }
  return pendingBetsPromise;
}

// ---- Team color/logo support for badge styling ----

export interface BetTeamInfo {
  displayName: string;
  logo: string;
  color: string;          // hex without leading #
  alternateColor?: string;
}

const SPORT_KEY_TO_LEAGUE: Record<string, string> = {
  americanfootball_nfl: 'NFL',
  americanfootball_ncaaf: 'NCAAF',
  basketball_nba: 'NBA',
  basketball_ncaab: 'NCAAB',
  baseball_mlb: 'MLB',
  icehockey_nhl: 'NHL',
  soccer_usa_mls: 'MLS',
};

const teamMapCache: Record<string, Promise<Record<string, BetTeamInfo>>> = {};

// Kalshi team labels that don't reduce to any ESPN name variant
// (normalized Kalshi label → normalized ESPN map key).
const TEAM_KEY_ALIASES: Record<string, string> = {
  losangelesg: 'lagalaxy',       // MLS: LA Galaxy
  losangelesf: 'lafc',           // MLS: LAFC
  montral: 'cfmontral',          // MLS: CF Montréal (accent strips to 'montral')
  newyorkrb: 'redbullnewyork',   // MLS: NY Red Bulls
  newyorkcity: 'newyorkcityfc',  // MLS: NYCFC
  saintlouis: 'stlouiscitysc',   // MLS: St. Louis City SC
};

// Map lookup with alias fallback — use instead of raw map[normalizeTeamKey(x)].
export function teamInfoFromMap(
  map: Record<string, BetTeamInfo> | null,
  name: string | undefined | null,
): BetTeamInfo | null {
  if (!map || !name) return null;
  const key = normalizeTeamKey(name);
  return map[key] ?? map[TEAM_KEY_ALIASES[key] ?? ''] ?? null;
}

export const hexToRgba = (hex: string, alpha: number): string => {
  const h = hex.replace('#', '').trim();
  if (h.length !== 6) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

// ESPN team map for the game's league (cached per league, shared across cards).
export function useTeamColorMap(sportKey: string): Record<string, BetTeamInfo> | null {
  const [map, setMap] = useState<Record<string, BetTeamInfo> | null>(null);

  useEffect(() => {
    const league = SPORT_KEY_TO_LEAGUE[sportKey];
    if (!league) return;
    if (!teamMapCache[league]) {
      teamMapCache[league] = fetch(`/api/bet-team-logos?league=${league}`)
        .then(r => (r.ok ? r.json() : { teams: {} }))
        .then(d => (d.teams ?? {}) as Record<string, BetTeamInfo>)
        .catch(() => ({}));
    }
    let cancelled = false;
    teamMapCache[league].then(m => { if (!cancelled) setMap(m); });
    return () => { cancelled = true; };
  }, [sportKey]);

  return map;
}

// Accent color for the team the wager is on (same rules as the bets view):
// totals use the home team; otherwise the bet's team field / bet-text lead,
// then home/away fallbacks. Returns '#rrggbb' or null.
export function wageredTeamColor(
  bet: Bet,
  map: Record<string, BetTeamInfo> | null,
  awayTeam: string,
  homeTeam: string,
): string | null {
  if (!map) return null;
  const candidates: (string | undefined)[] = [];
  if (bet.betType === 'total') {
    candidates.push(homeTeam);
  } else {
    const lead = bet.bet?.match(/^([A-Za-z .'-]+?)(?:\s+[-+0-9]|,|$)/)?.[1]?.trim();
    const leadNoMl = lead?.replace(/\s+(ml|moneyline)$/i, '').trim();
    candidates.push(bet.team, leadNoMl !== lead ? leadNoMl : undefined, lead, bet.parlayTeams?.[0], homeTeam, awayTeam);
  }
  for (const c of candidates) {
    const info = teamInfoFromMap(map, c);
    if (info?.color) return `#${info.color}`;
  }
  return null;
}

// Pending game bets matching this game: same local event date AND a team-name
// match (away/home/team fields or a parlay/teaser leg), with a description fallback.
export function usePendingBetsForGame(awayTeam: string, homeTeam: string, commenceTime: string): Bet[] {
  const [matched, setMatched] = useState<Bet[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadPendingBets().then(bets => {
      if (cancelled) return;
      const d = new Date(commenceTime);
      const gameDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const away = norm(awayTeam);
      const home = norm(homeTeam);
      setMatched(bets.filter(b => {
        if (b.betType === 'future') return false;
        if (b.eventDate !== gameDate) return false;
        const names = [b.awayTeam, b.homeTeam, b.team, ...(b.parlayTeams ?? [])]
          .filter((n): n is string => !!n)
          .map(norm);
        if (names.some(n => n === away || n === home)) return true;
        const desc = norm(b.description || '');
        return desc.includes(away) || desc.includes(home);
      }));
    });
    return () => { cancelled = true; };
  }, [awayTeam, homeTeam, commenceTime]);

  return matched;
}

// Pending FUTURE bets for a league (display name, e.g. 'NBA', 'NCAAF', 'PGA').
export function usePendingFutureBets(leagueDisplay: string): Bet[] {
  const [bets, setBets] = useState<Bet[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadPendingBets().then(all => {
      if (cancelled) return;
      setBets(all.filter(b => b.betType === 'future' && b.league === leagueDisplay));
    });
    return () => { cancelled = true; };
  }, [leagueDisplay]);

  return bets;
}

// ---- Shared badge visuals ----

export function TicketIcon({ className, color }: { className?: string; color?: string | null }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? 'h-3 w-3 opacity-90 flex-shrink-0'}
      style={color ? { color } : undefined}
    >
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <path d="M13 5v2M13 11v2M13 17v2" />
    </svg>
  );
}

// Shared my-bet badge: strong team-color border with a light team-color fill;
// solid indigo fallback when no team color is available.
export function MyBetBadge({ accent, title, children }: {
  accent: string | null;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] md:text-xs font-semibold shadow-sm ${
        accent ? 'border-2 text-gray-900' : 'bg-indigo-600 text-white'
      }`}
      style={accent ? {
        borderColor: accent,
        backgroundColor: hexToRgba(accent, 0.12),
      } : undefined}
      title={title}
    >
      <TicketIcon color={accent} />
      {children}
    </span>
  );
}

// Logo with fallback chain: tries each src in order; when exhausted renders
// the optional fallback node (else nothing).
export function TeamLogoImg({ srcs, className, fallback }: {
  srcs: (string | undefined)[];
  className: string;
  fallback?: React.ReactNode;
}) {
  const [idx, setIdx] = useState(0);
  const list = srcs.filter((s): s is string => !!s);
  const src = list[idx];
  if (!src) return <>{fallback ?? null}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className={className} onError={() => setIdx(i => i + 1)} />
  );
}
