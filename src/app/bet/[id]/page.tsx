// src/app/bet/[id]/page.tsx
// Shareable link for a single tracked bet. Exists so the admin "send" ->
// Zapier -> Discord flow can post a URL that unfurls as the actual wager
// instead of a generic odds.day card. Redirects humans to the bets view.
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { wageredTeam, getTeamAssets, buildBetOgUrl, formatOdds } from '@/lib/betShare';

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

// team/logo/color + OG URL helpers live in lib/betShare so this page and the
// direct Discord post can never drift apart.

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

  const oddsStr = formatOdds(bet.odds);
  const title = bet.bet;
  const description = [
    bet.league,
    bet.bet_type !== 'future' ? bet.description : null,
    `${oddsStr} · ${bet.stake}u`,
    bet.book,
  ].filter(Boolean).join(' • ');

  const ogImageUrl = buildBetOgUrl(bet, logo, color);

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
