// src/lib/kenpom/types.ts

export interface KenpomGame {
  kenpom_game_id: string;
  game_date: string; // YYYY-MM-DD
  season: number;
  home_team: string;
  away_team: string;

  // Predictions (from fanmatch.php)
  predicted_home_score: number | null;
  predicted_away_score: number | null;

  // Actual quarter scoring (from box.php)
  home_q1: number | null;
  home_q2: number | null;
  home_q3: number | null;
  home_q4: number | null;
  home_total: number | null;
  away_q1: number | null;
  away_q2: number | null;
  away_q3: number | null;
  away_q4: number | null;
  away_total: number | null;

  has_predictions: boolean;
  has_box_score: boolean;
}

export interface FanmatchGame {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  predictedHomeScore: number;
  predictedAwayScore: number;
}

export interface BoxScore {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  homeQuarters: [number, number, number, number];
  awayQuarters: [number, number, number, number];
  homeTotal: number;
  awayTotal: number;
}

export interface ScrapeProgress {
  phase: string;
  current: number;
  total: number;
  gamesFound: number;
  gamesSaved: number;
  errors: string[];
}
