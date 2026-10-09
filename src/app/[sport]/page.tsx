// src/app/[sport]/page.tsx — server-rendered sport odds pages: /nfl, /nba, ...
//
// Google (and link previews) get the real board in the HTML: the page fetches
// the odds server-side (shared 60s data cache with /api/odds) and hands them
// to the interactive board as initial state, so the first paint has every
// game card and the client never refetches what it was given. ISR: the HTML
// is regenerated at most once a minute per sport, on demand.
//
// Static routes win over this dynamic segment, so /nfl/ratings (Ledger), /fbs,
// /fcs, /ratings, /terms etc. are untouched. Unknown slugs 404.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import OddsBoard from '@/components/OddsBoard';
import { getBoardGames } from '@/lib/server/boardOdds';
import { sportBySlug, sportLongName } from '@/lib/sportSlugs';

export const revalidate = 60;
// Explicit ISR: the render touches no request-time APIs (verified with
// dynamic='error' at build), and 'auto' was still serving it uncached.
export const dynamic = 'force-static';

type Params = { params: Promise<{ sport: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { sport } = await params;
  const s = sportBySlug(sport);
  if (!s) return { title: 'Not found | odds.day' };
  const long = sportLongName(s.slug);
  const title = `${long} Odds Today — Compare Spreads, Moneylines & Totals | odds.day`;
  const description = `Live ${long} betting odds compared across DraftKings, FanDuel, BetMGM, Caesars, BetRivers, Kalshi, Novig, ProphetX and Polymarket. Best spread, moneyline and total price on every game, updated every minute.`;
  const url = `https://www.odds.day/${s.slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website', siteName: 'odds.day' },
    twitter: { card: 'summary', title, description },
  };
}

export default async function SportPage({ params }: Params) {
  const { sport } = await params;
  const s = sportBySlug(sport);
  if (!s) notFound();

  const games = await getBoardGames(s.key);
  return <OddsBoard initialLeague={s.key} initialGames={games} initialFetchedAt={Date.now()} />;
}
