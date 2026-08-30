// src/lib/fbs/types.ts

export interface FbsTeamRating {
  teamName: string;       // canonical (ESPN location, fallback Powers name)
  powersName: string;      // name as it appears in the Brad Powers set ("Ohio State")
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

export interface FbsGameAdjustment {
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

export interface FbsClosingLine {
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

export interface FbsManualAdjustment {
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

export interface EspnFbsGame {
  id: string;
  date: string;
  homeTeam: string;   // ESPN displayName (with mascot)
  awayTeam: string;
  homeId: string;
  awayId: string;
  isNeutralSite: boolean;
  isCompleted: boolean;
}

export interface FbsConfig {
  hfaDefault: number;
  closingSource: string;
  season: number;
  lastProcessedDate: string | null;
  /** Stamped at the end of every completed sync — the admin UI reads it to
   *  tell a dropped connection apart from a sync that never ran. */
  updatedAt: string | null;
}
