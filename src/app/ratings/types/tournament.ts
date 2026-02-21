// src/app/ratings/types/tournament.ts

export interface BracketTeam {
  teamName: string;
  seed: number;
  rating: number;
  conference: string;
  logoUrl: string | null;
}

export interface BracketMatchup {
  id: string;                 // "R1-G1" (Round 1, Game 1)
  round: number;              // 0 = play-in, 1 = first round, ...
  position: number;           // vertical position within round
  topTeam: BracketTeam | null;
  bottomTeam: BracketTeam | null;
  projectedSpread: number | null;
  winProbTop: number | null;
  winner: 'top' | 'bottom' | null;
  isManualOverride: boolean;
  sourceMatchupIds: [string | null, string | null]; // prior matchups feeding in
}

export interface BracketConfig {
  id: string;
  name: string;               // "Big 12 Tournament"
  conference: string;          // KenPom ConfShort
  templateId: string;          // which bracket template
  teams: BracketTeam[];
  matchups: BracketMatchup[];
  updatedAt: string;
}

export interface TemplateMatchup {
  id: string;
  topSeed: number | null;     // filled by seed, or null if fed from prior round
  bottomSeed: number | null;
  topFromMatchup: string | null;
  bottomFromMatchup: string | null;
}

export interface BracketTemplate {
  id: string;                  // "8-team", "12-team-top4-bye"
  name: string;
  teamCount: number;
  rounds: { round: number; name: string; matchups: TemplateMatchup[] }[];
}
