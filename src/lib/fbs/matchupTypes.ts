// src/lib/fbs/matchupTypes.ts
// Response shape shared by /api/fbs/matchup and the Market tab (kept out of the
// route file: Next only allows handler exports there).

export interface MatchupSide {
  requested: string;
  matched: boolean;
  division: 'fbs' | 'fcs' | null;
  teamName: string | null;
  espnName: string | null;
  espnId: string | null;
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
