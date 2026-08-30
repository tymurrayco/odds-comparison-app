// src/lib/fbs/engine.ts

/**
 * FBS ratings engine — same market-feedback math as the NCAAB/FCS engines
 * (src/lib/ratings/engine.ts) and the FCS clone, per-team HFA from Brad Powers.
 *
 * projected = -((homeRating - awayRating) + hfa)   // home perspective
 * difference = closing - projected
 * adjustment = difference / 2                       // zero-sum split
 * away += adjustment; home -= adjustment
 */

import {
  FBS_DEFAULT_HFA,
  FBS_RATINGS_DECIMAL_PLACES,
  FBS_SPREAD_DECIMAL_PLACES,
} from './constants';
import { FbsGameAdjustment, FbsTeamRating } from './types';

export function roundToDecimal(value: number, places: number): number {
  const f = Math.pow(10, places);
  return Math.round(value * f) / f;
}

export function projectFbsSpread(
  homeRating: number,
  awayRating: number,
  hfaApplied: number
): number {
  return roundToDecimal(-((homeRating - awayRating) + hfaApplied), FBS_SPREAD_DECIMAL_PLACES);
}

export function hfaForGame(
  home: FbsTeamRating,
  isNeutralSite: boolean,
  hfaDefault: number = FBS_DEFAULT_HFA
): number {
  if (isNeutralSite) return 0;
  return home.hfa ?? hfaDefault;
}

/**
 * Process one game against a mutable ratings map (keyed by canonical teamName).
 * Mutates the two team ratings and returns the adjustment record.
 */
export function processFbsGame(
  game: {
    gameId: string;
    oddsApiId: string | null;
    date: string;
    homeTeam: string; // canonical
    awayTeam: string; // canonical
    closingSpread: number;
    closingSource: string;
    isNeutralSite: boolean;
  },
  ratings: Map<string, FbsTeamRating>,
  hfaDefault: number,
  season: number
): FbsGameAdjustment | null {
  const home = ratings.get(game.homeTeam);
  const away = ratings.get(game.awayTeam);
  if (!home || !away) return null;

  const hfaApplied = hfaForGame(home, game.isNeutralSite, hfaDefault);
  const projectedSpread = projectFbsSpread(home.rating, away.rating, hfaApplied);
  const difference = roundToDecimal(
    game.closingSpread - projectedSpread,
    FBS_RATINGS_DECIMAL_PLACES
  );
  const adjustment = roundToDecimal(difference / 2, FBS_RATINGS_DECIMAL_PLACES);

  const homeRatingBefore = home.rating;
  const awayRatingBefore = away.rating;

  const now = new Date().toISOString();
  away.rating = roundToDecimal(away.rating + adjustment, FBS_RATINGS_DECIMAL_PLACES);
  away.gamesProcessed += 1;
  away.updatedAt = now;
  home.rating = roundToDecimal(home.rating - adjustment, FBS_RATINGS_DECIMAL_PLACES);
  home.gamesProcessed += 1;
  home.updatedAt = now;

  return {
    gameId: game.gameId,
    oddsApiId: game.oddsApiId,
    gameDate: game.date,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    isNeutralSite: game.isNeutralSite,
    hfaApplied,
    projectedSpread,
    closingSpread: game.closingSpread,
    closingSource: game.closingSource,
    difference,
    adjustment,
    homeRatingBefore,
    homeRatingAfter: home.rating,
    awayRatingBefore,
    awayRatingAfter: away.rating,
    season,
  };
}

/**
 * Average the home-team spread across consensus books from one Odds API event.
 */
export function extractConsensusSpread(
  event: {
    home_team: string;
    bookmakers?: Array<{
      key: string;
      markets?: Array<{
        key: string;
        outcomes?: Array<{ name: string; point?: number }>;
      }>;
    }>;
  },
  bookKeys: string[]
): { spread: number; books: string[] } | null {
  const points: number[] = [];
  const books: string[] = [];
  for (const bk of event.bookmakers ?? []) {
    if (!bookKeys.includes(bk.key)) continue;
    const market = bk.markets?.find((m) => m.key === 'spreads');
    const outcome = market?.outcomes?.find((o) => o.name === event.home_team);
    if (outcome && typeof outcome.point === 'number') {
      points.push(outcome.point);
      books.push(bk.key);
    }
  }
  if (points.length === 0) return null;
  const avg = points.reduce((a, b) => a + b, 0) / points.length;
  return { spread: roundToDecimal(avg, FBS_SPREAD_DECIMAL_PLACES), books };
}
