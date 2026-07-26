// src/app/bet/[id]/page.tsx
// Shareable link for a single tracked bet. Exists so the admin "send" ->
// Zapier -> Discord flow can post a URL that unfurls as the actual wager
// instead of a generic odds.day card. Redirects humans to the bets view.
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { supabase } from '@/lib/supabase';

interface BetRow {
  id: string;
  event_date: string;
  league: string;
  description: string;
  away_team?: string | null;
  home_team?: string | null;
  team?: string | null;
  bet_type: string;
  bet: string;
  odds: number;
  stake: number;
  status: string;
  book?: string | null;
  parlay_teams?: string[] | null;
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

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function matchScore(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x === y) return 4;
  if (x.includes(y) || y.includes(x)) return 3;
  if (x.split(' ')[0] === y.split(' ')[0]) return 2;
  if (x.split(' ').slice(-1)[0] === y.split(' ').slice(-1)[0]) return 1;
  return 0;
}

async function getBet(id: string): Promise<BetRow | null> {
  try {
    const { data, error } = await supabase
      .from('bets')
      .select('*')
      .eq('id', id)
      .eq('deleted', false)
      .limit(1);
    if (error || !data || data.length === 0) return null;
    return data[0] as BetRow;
  } catch {
    return null;
  }
}

// The team the wager is ON — same precedence as the bets view: bet-text lead,
// team field, parlay first leg; totals fall back to the home team.
function wageredTeam(bet: BetRow): string | null {
  if (bet.bet_type === 'total') return bet.home_team || null;
  const lead = bet.bet?.match(/^([A-Za-z .'-]+?)(?:\s+[-+0-9]|,|$)/)?.[1]?.trim();
  const leadNoMl = lead?.replace(/\s+(ml|moneyline)$/i, '').trim();
  return bet.team || leadNoMl || lead || bet.parlay_teams?.[0] || bet.home_team || bet.away_team || null;
}

async function getTeamAssets(league: string, teamName: string | null) {
  const cfg = ESPN_LEAGUE_MAP[league];
  if (!cfg || !teamName) return { logo: null as string | null, color: null as string | null };
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

function buildOgUrl(bet: BetRow, logo: string | null, color: string | null): string {
  const p = new URLSearchParams({
    pick: bet.bet,
    league: bet.league,
    status: bet.status,
    odds: bet.odds > 0 ? `+${bet.odds}` : `${bet.odds}`,
    units: `${bet.stake}u`,
  });
  if (bet.bet_type !== 'future' && bet.description) p.set('matchup', bet.description);
  if (bet.book) p.set('book', bet.book);
  if (logo) p.set('logo', logo);
  if (color) p.set('color', color);
  const when = new Date(bet.event_date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
  p.set('when', when);
  return `https://www.odds.day/api/og-bet?${p.toString()}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const bet = await getBet(id);
  if (!bet) {
    return { title: 'Bet Not Found | odds.day', description: 'This bet could not be found.' };
  }

  const team = wageredTeam(bet);
  const { logo, color } = await getTeamAssets(bet.league, team);

  const oddsStr = bet.odds > 0 ? `+${bet.odds}` : `${bet.odds}`;
  const title = bet.bet;
  const description = [
    bet.league,
    bet.bet_type !== 'future' ? bet.description : null,
    `${oddsStr} · ${bet.stake}u`,
    bet.book,
  ].filter(Boolean).join(' • ');

  const ogImageUrl = buildOgUrl(bet, logo, color);

  return {
    title: `${title} | odds.day`,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: 'odds.day',
      url: `https://www.odds.day/bet/${id}`,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function BetSharePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bet = await getBet(id);
  if (!bet) redirect('/');

  const redirectUrl = '/?view=mybets';
  return (
    <html>
      <head>
        <meta httpEquiv="refresh" content={`0;url=${redirectUrl}`} />
        <script dangerouslySetInnerHTML={{ __html: `window.location.href = "${redirectUrl}";` }} />
      </head>
      <body style={{
        backgroundColor: '#ffffff', color: '#0f172a', display: 'flex',
        alignItems: 'center', justifyContent: 'center', height: '100vh',
        margin: 0, fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ marginBottom: '10px' }}>{bet.bet}</h1>
          <p>Loading…</p>
        </div>
      </body>
    </html>
  );
}
