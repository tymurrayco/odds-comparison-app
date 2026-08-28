// src/app/fcs/page.tsx
// Public read-only FCS power ratings + upcoming projections
// (linked from the NCAAF tab next to Props).

import FcsRatingsView from '@/components/FcsRatingsView';

export default function FcsPublicPage() {
  return <FcsRatingsView />;
}
