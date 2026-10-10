// src/app/bets/page.tsx — /bets, the address of the Bets view.
//
// The Bets view is a state of the board, not a page of its own, so this only
// forwards to the board with that view open. The board then shows the address
// as /bets again (see the URL mirror in OddsBoard), which is what people copy.

import { redirect } from 'next/navigation';

export default function BetsPage() {
  redirect('/?view=mybets');
}
