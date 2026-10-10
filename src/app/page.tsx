// src/app/page.tsx — the home board. The interactive board itself lives in
// src/components/OddsBoard.tsx; the per-sport pages (/nfl, /nba, ...) render
// the same component with server-fetched odds so crawlers see real content.
// Here no league is forced: the board restores the visitor's last league from
// localStorage, as it always has.

import OddsBoard from '@/components/OddsBoard';
import { getLeagueOrder } from '@/lib/server/leagueOrder';

// Rebuilt every 10 minutes so the league pills stay in busiest-day-first order
export const revalidate = 600;

export default async function Home() {
  return <OddsBoard leagueOrder={await getLeagueOrder()} />;
}
