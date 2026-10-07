// src/app/nfl/ratings/page.tsx
// Public read-only NFL Ledger ratings + upcoming projections (linked from the
// NFL tab's Ledger button). Lived at /nfl until 2026-10-06, when /nfl became
// the server-rendered NFL odds page; middleware 308s old /nfl?view=<ledger
// view> links here.

import type { Metadata } from 'next';
import NflRatingsView from '@/components/NflRatingsView';

export const metadata: Metadata = {
  title: 'NFL Ledger Ratings | odds.day',
  description: 'Market-driven NFL power ratings moved only by closing lines, with projected spreads, totals, futures and strength of schedule.',
  alternates: { canonical: 'https://www.odds.day/nfl/ratings' },
};

export default function NflPublicPage() {
  return <NflRatingsView />;
}
