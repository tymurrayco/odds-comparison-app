// src/lib/friendBets.ts
//
// Pending bets of the people the signed-in visitor follows, for the friend
// chips on game cards. One query per page load, shared by every card. The
// database decides what comes back: only accepted follows return rows.
'use client';

import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { rowToBet, type Bet, type DbBetRow } from './betTypes';
import { listFollowing, type Profile } from './social';
import { betMatchesGame, normalizeTeamKey } from './myGameBets';

export interface FriendBet {
  bet: Bet;
  owner: Profile;
}

let friendBetsPromise: Promise<FriendBet[]> | null = null;

function loadFriendBets(): Promise<FriendBet[]> {
  if (!friendBetsPromise) {
    friendBetsPromise = (async () => {
      const followed = (await listFollowing()).filter((e) => e.status === 'accepted').map((e) => e.profile);
      if (followed.length === 0) return [];
      const byId = new Map(followed.map((p) => [p.id, p]));
      // Yesterday on: covers games still on the board without reading old bets
      const d = new Date(Date.now() - 86_400_000);
      const since = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const { data, error } = await supabase
        .from('bets')
        .select('*')
        .in('user_id', followed.map((p) => p.id))
        .eq('deleted', false)
        .eq('status', 'pending')
        .gte('event_date', since);
      if (error || !data) return [];
      return (data as (DbBetRow & { user_id: string })[])
        .filter((row) => byId.has(row.user_id))
        .map((row) => ({ bet: rowToBet(row), owner: byId.get(row.user_id)! }));
    })().catch(() => []);
  }
  return friendBetsPromise;
}

/** Followed people's pending bets on this game (empty when signed out or following no one). */
export function useFriendBetsForGame(awayTeam: string, homeTeam: string, commenceTime: string): FriendBet[] {
  const [matched, setMatched] = useState<FriendBet[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadFriendBets().then((all) => {
      if (cancelled) return;
      setMatched(all.filter((f) => f.bet.betType !== 'future' && betMatchesGame(f.bet, awayTeam, homeTeam, commenceTime)));
    });
    return () => {
      cancelled = true;
    };
  }, [awayTeam, homeTeam, commenceTime]);

  return matched;
}

const PARTIAL_GAME = /\b(1h|2h|[1-4]q|half|quarter|period|inning)\b/i;

/** A full-game spread, moneyline or total on this game, in a form the board can price. */
export type GameSide =
  | { betType: 'spread' | 'moneyline'; team: string }
  | { betType: 'total'; totalType: 'Over' | 'Under' };

export function gameSide(bet: Bet, awayTeam: string, homeTeam: string): GameSide | null {
  if (PARTIAL_GAME.test(bet.bet)) return null; // half and quarter bets are their own bets
  if (bet.betType === 'total') {
    const m = bet.bet.match(/\b(over|under)\b/i);
    return m ? { betType: 'total', totalType: m[1].toLowerCase() === 'over' ? 'Over' : 'Under' } : null;
  }
  if (bet.betType !== 'spread' && bet.betType !== 'moneyline') return null;
  const away = normalizeTeamKey(awayTeam);
  const home = normalizeTeamKey(homeTeam);
  const team = normalizeTeamKey(bet.team ?? '');
  const text = normalizeTeamKey(bet.bet);
  if (team === away || text.startsWith(away)) return { betType: bet.betType, team: awayTeam };
  if (team === home || text.startsWith(home)) return { betType: bet.betType, team: homeTeam };
  return null;
}

/**
 * Which chip a bet belongs to. Same side of the same market = same chip, even
 * at a different number or price ("Rams +3" and "Rams +3.5"); anything the
 * board can't place (props, parlays, half bets) groups by its exact text.
 */
export function betGroupKey(bet: Bet, awayTeam: string, homeTeam: string): string {
  const side = gameSide(bet, awayTeam, homeTeam);
  if (!side) return `${bet.betType}|${normalizeTeamKey(bet.bet)}`;
  return side.betType === 'total' ? `total|${side.totalType}` : `${side.betType}|${normalizeTeamKey(side.team)}`;
}
