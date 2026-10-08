// src/lib/betSettle.ts
//
// Pure grading of a straight bet against a final score. No I/O, so the
// settle route and any future per-user bet table share one set of rules.
// Handles spread / moneyline / total / team_total; props, parlays, teasers
// and futures return null (settled by hand).

import { foldTeamName } from './espnTeamMatch';
import type { Bet, BetStatus } from './betTypes';

export interface FinalScore {
  away: number;
  home: number;
}

export interface Grade {
  status: Exclude<BetStatus, 'pending'>;
  result: string;
}

type Side = 'away' | 'home';

const NUM = '(-?(?:\\d+\\.?\\d*|\\.\\d+))';

function sideOf(name: string | undefined, bet: Bet): Side | null {
  if (!name) return null;
  const key = foldTeamName(name);
  if (bet.awayTeam && foldTeamName(bet.awayTeam) === key) return 'away';
  if (bet.homeTeam && foldTeamName(bet.homeTeam) === key) return 'home';
  return null;
}

/** "Oregon Ducks +6", "Carolina Panthers +3 Live" → { team: 'Oregon Ducks', line: 6 } */
function parseSpread(text: string): { team: string; line: number } | null {
  const m = text.match(/^(.+?)\s+([-+](?:\d+\.?\d*|\.\d+))(?!\d)/);
  return m ? { team: m[1].trim(), line: Number(m[2]) } : null;
}

function cmp(diff: number): 'won' | 'lost' | 'push' {
  if (diff > 0) return 'won';
  if (diff < 0) return 'lost';
  return 'push';
}

// Half / quarter bets ("Florida International Panthers -3 1H") settle on a
// score this module never sees — leave them for hand-grading rather than
// grade them against the final.
const PARTIAL_GAME = /\b(?:[12]H|[1-4]Q|(?:1st|2nd|first|second)\s+half|(?:1st|2nd|3rd|4th)\s+quarter)\b/i;

export function gradeBet(bet: Bet, score: FinalScore): Grade | null {
  if (PARTIAL_GAME.test(bet.bet)) return null;
  const result = `Final: ${bet.awayTeam ?? 'Away'} ${score.away}, ${bet.homeTeam ?? 'Home'} ${score.home}`;
  const done = (status: Grade['status']): Grade => ({ status, result });

  switch (bet.betType) {
    case 'spread': {
      const p = parseSpread(bet.bet);
      const side = sideOf(bet.team, bet) ?? sideOf(p?.team, bet);
      if (!p || !side) return null;
      const mine = side === 'away' ? score.away : score.home;
      const theirs = side === 'away' ? score.home : score.away;
      return done(cmp(mine + p.line - theirs));
    }
    case 'moneyline': {
      const lead = bet.bet.replace(/\s+ml\b.*$/i, '').trim();
      const side = sideOf(bet.team, bet) ?? sideOf(lead, bet);
      if (!side) return null;
      const mine = side === 'away' ? score.away : score.home;
      const theirs = side === 'away' ? score.home : score.away;
      return done(cmp(mine - theirs));
    }
    case 'total': {
      const m = bet.bet.match(new RegExp(`^(over|under)\\s+${NUM}`, 'i'));
      if (!m) return null;
      const diff = score.away + score.home - Number(m[2]);
      return done(cmp(m[1].toLowerCase() === 'over' ? diff : -diff));
    }
    case 'team_total': {
      const m = bet.bet.match(new RegExp(`^(.+?)\\s+(over|under)\\s+${NUM}`, 'i'));
      if (!m) return null;
      const side = sideOf(bet.team, bet) ?? sideOf(m[1], bet);
      if (!side) return null;
      const diff = (side === 'away' ? score.away : score.home) - Number(m[3]);
      return done(cmp(m[2].toLowerCase() === 'over' ? diff : -diff));
    }
    default:
      return null;
  }
}
