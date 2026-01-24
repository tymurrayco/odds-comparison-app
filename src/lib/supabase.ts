// src/lib/supabase.ts

import { createClient } from '@supabase/supabase-js';

// These will come from your .env.local file
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Create a single supabase client for interacting with your database
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Type definitions for our database
export interface DatabaseBet {
  id: string;
  created_at: string;
  updated_at: string;
  date: string;
  event_date: string;
  sport: string;
  league: string;
  description: string;
  away_team?: string;
  home_team?: string;
  team?: string;
  bet_type: 'spread' | 'moneyline' | 'total' | 'prop' | 'parlay' | 'future';
  bet: string;
  odds: number;
  stake: number;
  status: 'pending' | 'won' | 'lost' | 'push';
  result?: string;
  payout?: number;
  book?: string;
  notes?: string;
  deleted: boolean;
}