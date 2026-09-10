// src/lib/fbs/matchupTypes.ts
// Response shape shared by /api/fbs/matchup, /api/nfl/matchup and the Ledger
// tab (kept out of the route files: Next only allows handler exports there).

export type LedgerDivision = 'fbs' | 'fcs' | 'nfl';

export interface MatchupSide {
  requested: string;
  matched: boolean;
  division: LedgerDivision | null;
  teamName: string | null;
  espnName: string | null;
  espnId: string | null;
  logo: string | null;          // ESPN CDN logo (ncaa keys off id, nfl off abbreviation)
  rating: number | null;        // on its own division's scale
  ratingOnScale: number | null; // on the projection scale (FCS bridged for cross games)
  seedRating: number | null;
  delta: number | null;         // rating - seed (closing-line adjustments to date)
  rank: number | null;
  of: number | null;
  gamesProcessed: number | null;
  hfa: number | null;
  conference: string | null;
}
