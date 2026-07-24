// src/lib/myGameBets.ts
// Shared lookup of the user's pending bets for game-header badges.
// Fetches once per page load (module-level cache) so every GameCard
// instance shares a single Supabase query.
'use client';

import { useEffect, useState } from 'react';
import { fetchBets, Bet } from './betService';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

let pendingBetsPromise: Promise<Bet[]> | null = null;

function loadPendingGameBets(): Promise<Bet[]> {
  if (!pendingBetsPromise) {
    pendingBetsPromise = fetchBets()
      .then(bets => bets.filter(b => b.status === 'pending' && b.betType !== 'future'))
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
};

const teamMapCache: Record<string, Promise<Record<string, BetTeamInfo>>> = {};

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
    if (!c) continue;
    const info = map[norm(c)];
    if (info?.color) return `#${info.color}`;
  }
  return null;
}

// Pending bets matching this game: same local event date AND a team-name match
// (away/home/team fields or a parlay/teaser leg), with a description fallback.
export function usePendingBetsForGame(awayTeam: string, homeTeam: string, commenceTime: string): Bet[] {
  const [matched, setMatched] = useState<Bet[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadPendingGameBets().then(bets => {
      if (cancelled) return;
      const d = new Date(commenceTime);
      const gameDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const away = norm(awayTeam);
      const home = norm(homeTeam);
      setMatched(bets.filter(b => {
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
