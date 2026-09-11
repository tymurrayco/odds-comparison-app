// src/lib/nfl/types.ts

export interface NflTeamRating {
  teamName: string;       // canonical (ESPN displayName, e.g. "Kansas City Chiefs")
  seedName: string;       // name as it appears in the seed set
  espnName: string | null;
  espnId: string | null;
  espnAbbr: string | null; // "KC" — ESPN logo key
  conference: string | null;
  rating: number;
  initialRating: number;
  hfa: number | null;
  gamesProcessed: number;
  season: number;
  updatedAt: string;
}

export interface NflGameAdjustment {
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

export interface NflClosingLine {
  gameId: string;
  oddsApiId: string | null;
  gameDate: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  isNeutralSite: boolean;
  closingSpread: number | null; // null = checked, no line available
  closingSource: string | null;
  closingTotal?: number | null; // consensus total at close (totals Ledger)
  bookmakers: string[] | null;
}

export interface NflManualAdjustment {
  id: number;
  teamName: string;
  season: number;
  adjustDate: string;   // position in the replay timeline
  delta: number;        // points added to this team (not zero-sum)
  note: string | null;
  ratingBefore: number | null; // stamped by replay
  ratingAfter: number | null;
  appliedAt: string | null;
  updatedAt: string;
  pending: boolean;     // updated since last replay (or never applied)
}

export interface EspnNflGame {
  id: string;
  date: string;
  homeTeam: string;   // ESPN displayName (with mascot)
  awayTeam: string;
  homeId: string;
  awayId: string;
  isNeutralSite: boolean;
  isCompleted: boolean;
}

export interface NflConfig {
  hfaDefault: number;
  closingSource: string;
  season: number;
  lastProcessedDate: string | null;
  /** Stamped at the end of every completed sync — the admin UI reads it to
   *  tell a dropped connection apart from a sync that never ran. */
  updatedAt: string | null;
}
