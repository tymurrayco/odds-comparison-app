// src/lib/betService.ts
//
// Bets belong to the signed-in visitor (src/lib/userAuth.ts). Reads go
// straight to Supabase with the visitor's session, so RLS returns only their
// own rows; signed out there is nothing to read. Writes go through
// POST/PATCH/DELETE /api/bets, which checks the same session's access token
// and writes with the service-role key. Column mapping lives in betTypes.ts
// so the route and this file agree.

import { supabase } from './supabase';
import { rowToBet, type Bet, type BetStatus, type BetType, type DbBetRow } from './betTypes';

export type { Bet, BetStatus, BetType };

// Fetch the signed-in visitor's bets (empty when signed out)
export async function fetchBets(): Promise<Bet[]> {
  const { data: auth } = await supabase.auth.getSession();
  const userId = auth.session?.user.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from('bets')
    .select('*')
    .eq('user_id', userId)
    .eq('deleted', false)
    .order('event_date', { ascending: false });

  if (error) {
    console.error('Error fetching bets:', error);
    return [];
  }

  return (data as DbBetRow[]).map(rowToBet);
}

// Someone else's bets — only returns rows when the caller follows them (and,
// for a private account, has been approved); the database enforces that.
export async function fetchBetsOf(userId: string): Promise<Bet[]> {
  const { data, error } = await supabase
    .from('bets')
    .select('*')
    .eq('user_id', userId)
    .eq('deleted', false)
    .order('event_date', { ascending: false });

  if (error) {
    console.error('Error fetching bets:', error);
    return [];
  }

  return (data as DbBetRow[]).map(rowToBet);
}

// One place to send a write with the visitor's access token and turn a
// failure into a readable error.
async function writeBets(method: 'POST' | 'PATCH' | 'DELETE', body: unknown): Promise<{ bet?: DbBetRow }> {
  const { data: auth } = await supabase.auth.getSession();
  const token = auth.session?.access_token;
  if (!token) throw new Error('Sign in to save bets.');

  const res = await fetch('/api/bets', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    keepalive: true, // "Track + open" may leave the page for the book's app mid-save
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error ?? `Bet write failed (${res.status})`);
  }
  return json;
}

// Create a new bet
export async function createBet(bet: Omit<Bet, 'id'>) {
  try {
    const { bet: row } = await writeBets('POST', { bet });
    return row;
  } catch (error) {
    console.error('Error creating bet:', error);
    throw error;
  }
}

// Update an existing bet
export async function updateBet(id: string, updates: Partial<Bet>) {
  try {
    const { bet: row } = await writeBets('PATCH', { id, updates });
    return row;
  } catch (error) {
    console.error('Error updating bet:', error);
    throw error;
  }
}

// Delete a bet (soft delete)
export async function deleteBet(id: string) {
  try {
    await writeBets('DELETE', { id });
  } catch (error) {
    console.error('Error deleting bet:', error);
    throw error;
  }
}

// Calculate payout (total return including stake)
export function calculatePayout(stake: number, odds: number): number {
  if (odds > 0) {
    return stake + (stake * (odds / 100));
  } else {
    return stake + (stake / (Math.abs(odds) / 100));
  }
}

// Calculate profit for a winning bet (returns profit only, not total payout)
export function calculateProfit(stake: number, odds: number): number {
  if (odds > 0) {
    return stake * (odds / 100);
  } else {
    return stake / (Math.abs(odds) / 100);
  }
}

// Get statistics for a set of bets
export function getBetStats(bets: Bet[]) {
  const stats = {
    totalBets: bets.length,
    wonBets: bets.filter(b => b.status === 'won').length,
    lostBets: bets.filter(b => b.status === 'lost').length,
    pushBets: bets.filter(b => b.status === 'push').length,
    pendingBets: bets.filter(b => b.status === 'pending').length,
    totalStake: bets.reduce((sum, bet) => sum + bet.stake, 0),
    pendingStake: bets.filter(b => b.status === 'pending').reduce((sum, bet) => sum + bet.stake, 0),
    profit: 0,
    winRate: 0,
    roi: 0
  };

  // Calculate profit
  bets.forEach(bet => {
    if (bet.status === 'won') {
      stats.profit += calculateProfit(bet.stake, bet.odds);
    } else if (bet.status === 'lost') {
      stats.profit -= bet.stake;
    }
    // Push and pending don't affect profit
  });

  // Calculate win rate (excluding pushes and pending)
  const decidedBets = stats.wonBets + stats.lostBets;
  if (decidedBets > 0) {
    stats.winRate = (stats.wonBets / decidedBets) * 100;
  }

  // Calculate ROI
  const completedStake = bets
    .filter(b => b.status !== 'pending')
    .reduce((sum, bet) => sum + bet.stake, 0);

  if (completedStake > 0) {
    stats.roi = (stats.profit / completedStake) * 100;
  }

  return stats;
}

// Export empty array for backwards compatibility if needed
export const myBets: Bet[] = [];
