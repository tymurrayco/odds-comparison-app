// src/lib/fcs/types.ts

export interface MasseyFcsRow {
  masseyName: string;
  conference: string;
  rank: number;       // Pwr rank
  rat: number;        // Massey "Rat" (win-prob scale, informational)
  pwr: number;        // points-scale power rating — the seed value
  off: number;
  def: number;
  hfa: number;        // per-team home field advantage
}

export interface FcsTeamRating {
  teamName: string;       // canonical (ESPN location, fallback Massey name)
  masseyName: string;
  espnName: string | null;
  espnId: string | null;
  conference: string | null;
  rating: number;
  initialRating: number;
  hfa: number | null;
  gamesProcessed: number;
  season: number;
  updatedAt: string;
}

export interface FcsGameAdjustment {
  gameId: string;
  oddsApiId: string | null;
  gameDate: string;
  homeTeam: string;
  awayTeam: string;
  isNeutralSite: boolean;
  hfaApplied: number;
  projectedSpread: number;
  closingSpread: number;
  closingSource: string;
  difference: number;
  adjustment: number;
  homeRatingBefore: number;
  homeRatingAfter: number;
  awayRatingBefore: number;
  awayRatingAfter: number;
  season: number;
}

export interface FcsClosingLine {
  gameId: string;
  oddsApiId: string | null;
  gameDate: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  isNeutralSite: boolean;
  closingSpread: number | null; // null = checked, no line available
  closingSource: string | null;
  bookmakers: string[] | null;
}

export interface EspnFcsGame {
  id: string;
  date: string;
  homeTeam: string;   // ESPN displayName (with mascot)
  awayTeam: string;
  homeId: string;
  awayId: string;
  isNeutralSite: boolean;
  isCompleted: boolean;
}

export interface FcsConfig {
  hfaDefault: number;
  closingSource: string;
  season: number;
  lastProcessedDate: string | null;
}
