// src/app/nfl/page.tsx
// Public read-only NFL Ledger ratings + upcoming projections
// (linked from the NFL tab's Ledger button).

import NflRatingsView from '@/components/NflRatingsView';

export default function NflPublicPage() {
  return <NflRatingsView />;
}
