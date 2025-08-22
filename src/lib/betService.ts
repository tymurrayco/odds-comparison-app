// src/lib/betService.ts
// This replaces your myBets.ts file functionality with Supabase integration

import { supabase } from './supabase';

export type BetStatus = 'pending' | 'won' | 'lost' | 'push';
export type BetType = 'spread' | 'moneyline' | 'total' | 'prop' | 'parlay' | 'future';

// This matches your existing Bet interface
export interface Bet {
  id: string;
  date: string;
  eventDate: string;
  sport: string;
  league: string;
  description: string;
  awayTeam?: string;
  homeTeam?: string;
  betType: BetType;
  bet: string;
  odds: number;
  stake: number;
  status: BetStatus;
  result?: string;
  notes?: string;
  book?: string;
  team?: string;
}

// Fetch all bets from Supabase
export async function fetchBets(): Promise<Bet[]> {
  const { data, error } = await supabase
    .from('bets')
    .select('*')
    .eq('deleted', false)
    .order('event_date', { ascending: false });

  if (error) {
    console.error('Error fetching bets:', error);
    return [];
  }

  // Transform database format to match your existing format
  return data.map(dbBet => ({
    id: dbBet.id,
    date: dbBet.date,
    eventDate: dbBet.event_date,
    sport: dbBet.sport,
    league: dbBet.league,
    description: dbBet.description,
    awayTeam: dbBet.away_team || undefined,
    homeTeam: dbBet.home_team || undefined,
    team: dbBet.team || undefined,
    betType: dbBet.bet_type as BetType,
    bet: dbBet.bet,
    odds: dbBet.odds,
    stake: dbBet.stake,
    status: dbBet.status as BetStatus,
    result: dbBet.result || undefined,
    notes: dbBet.notes || undefined,
    book: dbBet.book || undefined,
  }));
}

// Create a new bet
export async function createBet(bet: Omit<Bet, 'id'>) {
  const dbBet = {
    date: bet.date,
    event_date: bet.eventDate,
    sport: bet.sport,
    league: bet.league,
    description: bet.description,
    away_team: bet.awayTeam || null,
    home_team: bet.homeTeam || null,
    team: bet.team || null,
    bet_type: bet.betType,
    bet: bet.bet,
    odds: bet.odds,
    stake: bet.stake,
    status: bet.status,
    result: bet.result || null,
    book: bet.book || null,
    notes: bet.notes || null,
    deleted: false
  };

  const { data, error } = await supabase
    .from('bets')
    .insert([dbBet])
    .select()
    .single();

  if (error) {
    console.error('Error creating bet:', error);
    throw error;
  }

  return data;
}

// Update an existing bet
export async function updateBet(id: string, updates: Partial<Bet>) {
  interface DbUpdate {
    date?: string;
    event_date?: string;
    sport?: string;
    league?: string;
    description?: string;
    away_team?: string | null;
    home_team?: string | null;
    team?: string | null;
    bet_type?: BetType;
    bet?: string;
    odds?: number;
    stake?: number;
    status?: BetStatus;
    result?: string | null;
    book?: string | null;
    notes?: string | null;
  }
  
  const dbUpdates: DbUpdate = {};
  
  // Only add fields that are being updated
  if (updates.date !== undefined) dbUpdates.date = updates.date;
  if (updates.eventDate !== undefined) dbUpdates.event_date = updates.eventDate;
  if (updates.sport !== undefined) dbUpdates.sport = updates.sport;
  if (updates.league !== undefined) dbUpdates.league = updates.league;
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.awayTeam !== undefined) dbUpdates.away_team = updates.awayTeam || null;
  if (updates.homeTeam !== undefined) dbUpdates.home_team = updates.homeTeam || null;
  if (updates.team !== undefined) dbUpdates.team = updates.team || null;
  if (updates.betType !== undefined) dbUpdates.bet_type = updates.betType;
  if (updates.bet !== undefined) dbUpdates.bet = updates.bet;
  if (updates.odds !== undefined) dbUpdates.odds = updates.odds;
  if (updates.stake !== undefined) dbUpdates.stake = updates.stake;
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.result !== undefined) dbUpdates.result = updates.result || null;
  if (updates.book !== undefined) dbUpdates.book = updates.book || null;
  if (updates.notes !== undefined) dbUpdates.notes = updates.notes || null;

  const { data, error } = await supabase
    .from('bets')
    .update(dbUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating bet:', error);
    throw error;
  }

  return data;
}

// Delete a bet (soft delete)
export async function deleteBet(id: string) {
  const { error } = await supabase
    .from('bets')
    .update({ deleted: true })
    .eq('id', id);

  if (error) {
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