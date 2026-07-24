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
