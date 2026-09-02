// src/lib/betShare.ts
// Shared helpers for turning a tracked bet into share assets (team logo/color,
// OG card URL). Used by /bet/[id] metadata and the direct Discord post so the
// two can never drift apart.

export interface ShareBet {
  id?: string;
  event_date?: string;
  eventDate?: string;
  league: string;
  description?: string;
  away_team?: string | null;
  awayTeam?: string | null;
  home_team?: string | null;
  homeTeam?: string | null;
  team?: string | null;
  bet_type?: string;
  betType?: string;
  bet: string;
  odds: number;
  stake: number;
  status: string;
  book?: string | null;
  parlay_teams?: string[] | null;
  parlayTeams?: string[] | null;
}

const ESPN_LEAGUE_MAP: { [key: string]: { sport: string; league: string } } = {
  NFL: { sport: 'football', league: 'nfl' },
  NCAAF: { sport: 'football', league: 'college-football' },
  NBA: { sport: 'basketball', league: 'nba' },
  NCAAB: { sport: 'basketball', league: 'mens-college-basketball' },
  NHL: { sport: 'hockey', league: 'nhl' },
  MLB: { sport: 'baseball', league: 'mlb' },
  WNBA: { sport: 'basketball', league: 'wnba' },
  MLS: { sport: 'soccer', league: 'usa.1' },
  CFL: { sport: 'football', league: 'cfl' },
};

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

function matchScore(a: string, b: string): number {
  // Accent-fold so "San José State" (ESPN) matches "San Jose State" (stored)
  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const x = fold(a);
  const y = fold(b);
  if (x === y) return 4;
  if (x.includes(y) || y.includes(x)) return 3;
  if (x.split(' ')[0] === y.split(' ')[0]) return 2;
  if (x.split(' ').slice(-1)[0] === y.split(' ').slice(-1)[0]) return 1;
  return 0;
}

const f = <T,>(a: T | null | undefined, b: T | null | undefined): T | null => a ?? b ?? null;

/** The team the wager is ON: bet-text lead / team field / first parlay leg; totals use home. */
export function wageredTeam(bet: ShareBet): string | null {
  const type = bet.bet_type ?? bet.betType;
  const home = f(bet.home_team, bet.homeTeam);
  const away = f(bet.away_team, bet.awayTeam);
  if (type === 'total') return home;
  const lead = bet.bet?.match(/^([A-Za-zÀ-ſ .'-]+?)(?:\s+[-+0-9]|,|$)/)?.[1]?.trim();
  const leadNoMl = lead?.replace(/\s+(ml|moneyline)$/i, '').trim();
  const parlay = f(bet.parlay_teams, bet.parlayTeams);
  return bet.team || leadNoMl || lead || parlay?.[0] || home || away || null;
}

export async function getTeamAssets(
  league: string,
  teamName: string | null
): Promise<{ logo: string | null; color: string | null }> {
  const cfg = ESPN_LEAGUE_MAP[league];
  if (!cfg || !teamName) return { logo: null, color: null };
  try {
    const resp = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/${cfg.sport}/${cfg.league}/teams?limit=1000`,
      { next: { revalidate: 86400 } }
    );
    if (!resp.ok) return { logo: null, color: null };
    const data = await resp.json();
    const teams = (data.sports?.[0]?.leagues?.[0]?.teams ?? []) as Array<{
      team?: { displayName?: string; shortDisplayName?: string; color?: string; logos?: Array<{ href?: string }> };
    }>;
    let best = 0;
    let logo: string | null = null;
    let color: string | null = null;
    for (const entry of teams) {
      const t = entry.team;
      if (!t) continue;
      const score = Math.max(
        matchScore(t.displayName || '', teamName),
        norm(t.shortDisplayName || '') === norm(teamName) ? 4 : 0
      );
      if (score > best) {
        best = score;
        logo = t.logos?.[0]?.href ?? null;
        color = t.color ?? null;
      }
    }
    return { logo, color };
  } catch {
    return { logo: null, color: null };
  }
}

export function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

export function buildBetOgUrl(bet: ShareBet, logo: string | null, color: string | null): string {
  const type = bet.bet_type ?? bet.betType;
  const eventDate = bet.event_date ?? bet.eventDate;
  const p = new URLSearchParams({
    pick: bet.bet,
    league: bet.league,
    status: bet.status,
    odds: formatOdds(bet.odds),
    units: `${bet.stake}u`,
  });
  if (type !== 'future' && bet.description) p.set('matchup', bet.description);
  if (bet.book) p.set('book', bet.book);
  if (logo) p.set('logo', logo);
  if (color) p.set('color', color);
  if (eventDate) {
    p.set('when', new Date(eventDate + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    }));
  }
  return `https://www.odds.day/api/og-bet?${p.toString()}`;
}

/** Hex (no #) -> Discord embed color int; falls back to the brand blue. */
export function embedColor(hex: string | null): number {
  const h = (hex || '').replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return 0x2563eb;
  return parseInt(h, 16);
}
