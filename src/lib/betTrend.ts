// src/lib/betTrend.ts
//
// How a bet is doing once its game is under way, for the colour of the little
// ticket icon on a game-card badge: green = covering, red = not, gray = dead
// level. Spreads and moneylines read the score as it stands. Totals read the
// PACE: points so far, scaled up to a full game by how much has been played —
// a high-scoring first quarter turns an Over green long before it has hit.
// Only full-game spread / moneyline / total bets get a trend; anything else
// (props, parlays, half and quarter bets) returns null and keeps its colour.

import type { ESPNGameScore } from './api';
import type { Bet } from './betTypes';
import { gameSide } from './friendBets';
import { normalizeTeamKey } from './myGameBets';

export type BetTrend = 'ahead' | 'behind' | 'even';

export const TREND_COLORS: Record<BetTrend, string> = {
  ahead: '#16a34a',
  behind: '#dc2626',
  even: '#9ca3af',
};

// Regulation length: periods × minutes, by Odds API sport key prefix
const CLOCKED: [prefix: string, periods: number, minutes: number][] = [
  ['americanfootball', 4, 15],
  ['basketball_ncaab', 2, 20],
  ['basketball_wnba', 4, 10],
  ['basketball', 4, 12],
  ['icehockey', 3, 20],
];
// Too little played to say anything about a total
const MIN_PLAYED = 0.08;

/** Share of regulation played, 0..1; null when the feed doesn't say. */
export function fractionPlayed(sportKey: string, score: ESPNGameScore): number | null {
  if (score.state === 'post') return 1;
  if (score.state !== 'in' || !score.period) return null;

  if (sportKey.startsWith('baseball')) {
    // No clock: half-innings. "Top 5th" / "Mid 5th" / "Bot 5th" / "End 5th"
    const half = /^end/i.test(score.statusDetail) ? 1 : /^(bot|mid)/i.test(score.statusDetail) ? 0.5 : 0;
    return Math.min(1, (score.period - 1 + half + 0.25) / 9);
  }
  if (sportKey.startsWith('soccer')) {
    // The clock counts up: "67'" or "45'+2'"
    const minute = parseInt(score.displayClock, 10);
    return Number.isFinite(minute) ? Math.min(1, minute / 90) : null;
  }
  const rule = CLOCKED.find(([prefix]) => sportKey.startsWith(prefix));
  if (!rule) return null;
  const [, periods, minutes] = rule;
  if (score.period > periods) return 1; // overtime
  // The clock counts down within the period: "7:42", or "42.1" in the last minute
  const parts = score.displayClock.split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return null;
  const left = parts.length === 2 ? parts[0] + parts[1] / 60 : parts[0] / 60;
  return Math.min(1, Math.max(0, ((score.period - 1) * minutes + (minutes - Math.min(minutes, left))) / (periods * minutes)));
}

const sign = (diff: number): BetTrend => (diff > 0 ? 'ahead' : diff < 0 ? 'behind' : 'even');

/** The bet's standing against the live (or final) score; null before kickoff or for bets this can't read. */
export function betTrend(
  bet: Bet,
  game: { sport_key: string; away_team: string; home_team: string },
  score: ESPNGameScore | null | undefined
): BetTrend | null {
  if (!score || score.state === 'pre') return null;
  const side = gameSide(bet, game.away_team, game.home_team);
  if (!side) return null;

  // The score feed names teams its own way and can list them the other way round
  const home = normalizeTeamKey(game.home_team);
  const away = normalizeTeamKey(game.away_team);
  const feedHome = normalizeTeamKey(score.homeTeam);
  const feedAway = normalizeTeamKey(score.awayTeam);
  const swapped = feedHome !== home && (feedHome === away || feedAway === home);
  const homePts = Number(swapped ? score.awayScore : score.homeScore);
  const awayPts = Number(swapped ? score.homeScore : score.awayScore);
  if (!Number.isFinite(homePts) || !Number.isFinite(awayPts)) return null;

  if (side.betType === 'total') {
    const line = Number(bet.bet.match(/(\d+(?:\.\d+)?)/)?.[1]);
    if (!Number.isFinite(line)) return null;
    const points = homePts + awayPts;
    const over = side.totalType === 'Over';
    if (points > line) return over ? 'ahead' : 'behind'; // already over the number: settled either way
    const played = fractionPlayed(game.sport_key, score);
    if (played === null) return null;
    if (played >= 1) return sign(over ? points - line : line - points);
    if (played < MIN_PLAYED) return 'even';
    const pace = points / played;
    if (Math.abs(pace - line) < 0.5) return 'even';
    return pace > line === over ? 'ahead' : 'behind';
  }

  const mine = normalizeTeamKey(side.team) === home ? homePts - awayPts : awayPts - homePts;
  if (side.betType === 'moneyline') return sign(mine);
  // "Chiefs -3.5", "Chiefs +3", "Chiefs PK"
  const m = bet.bet.match(/([-+]\d+(?:\.\d+)?)(?!\d)/);
  const line = m ? Number(m[1]) : /\b(pk|pick)\b/i.test(bet.bet) ? 0 : NaN;
  return Number.isFinite(line) ? sign(mine + line) : null;
}
