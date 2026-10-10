// src/lib/betTypes.ts
//
// Bet shapes + the camelCase ↔ bets-table column mapping, shared by the
// browser (betService.ts) and the server write route (/api/bets). No
// Supabase import here so either side can use it.

export type BetStatus = 'pending' | 'won' | 'lost' | 'push';
export type BetType = 'spread' | 'moneyline' | 'total' | 'team_total' | 'prop' | 'parlay' | 'teaser' | 'future';

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
  parlayTeams?: string[];
  /** Placed after the game started (set by the ticket at save, or by hand in Edit / Bet Admin). */
  live?: boolean;
}

/** A `bets` row as PostgREST returns it. */
export interface DbBetRow {
  id: string;
  date: string;
  event_date: string;
  sport: string;
  league: string;
  description: string;
  away_team: string | null;
  home_team: string | null;
  team: string | null;
  bet_type: string;
  bet: string;
  odds: number;
  stake: number;
  status: string;
  result: string | null;
  book: string | null;
  notes: string | null;
  parlay_teams: string[] | null;
  deleted: boolean;
  live?: boolean | null; // sql/bets_live.sql; absent until that has been run
}

export interface DbBetUpdate {
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
  parlay_teams?: string[] | null;
  live?: boolean;
}

export function rowToBet(dbBet: DbBetRow): Bet {
  return {
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
    parlayTeams: dbBet.parlay_teams || undefined,
    live: dbBet.live === true,
  };
}

export function betToInsertRow(bet: Omit<Bet, 'id'>): Omit<DbBetRow, 'id'> {
  return {
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
    parlay_teams: bet.parlayTeams || null,
    deleted: false,
    live: bet.live === true,
  };
}

/** Only the fields present in `updates` become columns (undefined = untouched). */
export function betToUpdateRow(updates: Partial<Bet>): DbBetUpdate {
  const u: DbBetUpdate = {};
  if (updates.date !== undefined) u.date = updates.date;
  if (updates.eventDate !== undefined) u.event_date = updates.eventDate;
  if (updates.sport !== undefined) u.sport = updates.sport;
  if (updates.league !== undefined) u.league = updates.league;
  if (updates.description !== undefined) u.description = updates.description;
  if (updates.awayTeam !== undefined) u.away_team = updates.awayTeam || null;
  if (updates.homeTeam !== undefined) u.home_team = updates.homeTeam || null;
  if (updates.team !== undefined) u.team = updates.team || null;
  if (updates.betType !== undefined) u.bet_type = updates.betType;
  if (updates.bet !== undefined) u.bet = updates.bet;
  if (updates.odds !== undefined) u.odds = updates.odds;
  if (updates.stake !== undefined) u.stake = updates.stake;
  if (updates.status !== undefined) u.status = updates.status;
  if (updates.result !== undefined) u.result = updates.result || null;
  if (updates.book !== undefined) u.book = updates.book || null;
  if (updates.notes !== undefined) u.notes = updates.notes || null;
  if (updates.parlayTeams !== undefined) u.parlay_teams = updates.parlayTeams || null;
  if (updates.live !== undefined) u.live = updates.live === true;
  return u;
}
