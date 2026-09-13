// src/lib/playerTeam.ts

/**
 * Which of a game's two teams does a player belong to? Prop bets are logged
 * with a player name and the matchup but no side; the badge accent and the
 * share page theme both want the player's team. Resolved from ESPN rosters
 * (one fetch per team, cached a day). Server-side only (uses fetch with
 * Next's data cache); the client goes through /api/player-team.
 */

import { matchEspnTeam, EspnTeamLike } from './espnTeamMatch';

const LEAGUES: Record<string, { sport: string; league: string }> = {
  NFL: { sport: 'football', league: 'nfl' },
  americanfootball_nfl: { sport: 'football', league: 'nfl' },
  americanfootball_nfl_preseason: { sport: 'football', league: 'nfl' },
  NCAAF: { sport: 'football', league: 'college-football' },
  americanfootball_ncaaf: { sport: 'football', league: 'college-football' },
  NBA: { sport: 'basketball', league: 'nba' },
  basketball_nba: { sport: 'basketball', league: 'nba' },
  NCAAB: { sport: 'basketball', league: 'mens-college-basketball' },
  basketball_ncaab: { sport: 'basketball', league: 'mens-college-basketball' },
  NHL: { sport: 'hockey', league: 'nhl' },
  icehockey_nhl: { sport: 'hockey', league: 'nhl' },
  MLB: { sport: 'baseball', league: 'mlb' },
  baseball_mlb: { sport: 'baseball', league: 'mlb' },
  WNBA: { sport: 'basketball', league: 'wnba' },
  basketball_wnba: { sport: 'basketball', league: 'wnba' },
};

const fold = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/* eslint-disable @typescript-eslint/no-explicit-any */

async function espnTeams(cfg: { sport: string; league: string }): Promise<EspnTeamLike[]> {
  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/${cfg.sport}/${cfg.league}/teams?limit=1000`,
    { next: { revalidate: 86400 } }
  );
  if (!res.ok) return [];
  const json = await res.json();
  return (json?.sports?.[0]?.leagues?.[0]?.teams ?? []).map((e: any) => e.team).filter(Boolean);
}

async function rosterNames(cfg: { sport: string; league: string }, teamId: string): Promise<string[]> {
  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/${cfg.sport}/${cfg.league}/teams/${teamId}/roster`,
    { next: { revalidate: 86400 } }
  );
  if (!res.ok) return [];
  const json = await res.json();
  const out: string[] = [];
  // Football rosters group by unit ({position, items}); other sports are flat
  for (const g of json?.athletes ?? []) {
    const items = Array.isArray(g?.items) ? g.items : [g];
    for (const a of items) {
      const n = a?.displayName ?? a?.fullName;
      if (n) out.push(n);
    }
  }
  return out;
}

/** Player name on a roster: exact fold, else last name + first initial (handles "Pat" / "Patrick"). */
function onRoster(player: string, names: string[]): boolean {
  const p = fold(player);
  if (!p) return false;
  if (names.some((n) => fold(n) === p)) return true;
  const parts = p.split(' ');
  if (parts.length < 2) return false;
  const last = parts[parts.length - 1];
  const initial = parts[0][0];
  return names.some((n) => {
    const f = fold(n).split(' ');
    return f.length >= 2 && f[f.length - 1] === last && f[0][0] === initial;
  });
}

/**
 * Resolve a player to one of the given team names (returned verbatim so it
 * matches the bet's own away/home strings). Null when neither roster has
 * the player or the league isn't covered.
 */
export async function resolvePlayerTeam(
  league: string,
  player: string,
  teams: string[]
): Promise<string | null> {
  const cfg = LEAGUES[league];
  if (!cfg || !player.trim()) return null;
  const candidates = teams.map((t) => t.trim()).filter(Boolean);
  if (candidates.length === 0) return null;
  const all = await espnTeams(cfg);
  for (const teamName of candidates) {
    const hit = matchEspnTeam(teamName, all);
    if (!hit) continue;
    try {
      const names = await rosterNames(cfg, String(hit.id));
      if (onRoster(player, names)) return teamName;
    } catch {
      /* roster unavailable — try the other side */
    }
  }
  return null;
}

/** First token(s) of a prop bet's text up to Over/Under: "Patrick Mahomes Over 275.5 …" -> "Patrick Mahomes". */
export function propPlayerName(betText: string): string | null {
  const m = betText.match(/^(.+?)\s+(?:over|under|o|u)\s*\d/i);
  return m ? m[1].trim() : null;
}
