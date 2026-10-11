// src/components/BetsTip.tsx
//
// One-time pointer at the header's Bets button, shown the first time an
// account tracks a bet: "Saved. Your bets live here." Rendered inside the
// button's (relative) wrapper so it hangs under it, the same bubble as the
// account pointer in AccountButton. Seen once per account (prefs.betsTipSeen).
'use client';

import { useEffect, useState } from 'react';
import { usePrefs, savePrefs } from '@/lib/prefs';
import { BET_CREATED_EVENT } from '@/lib/betService';

export default function BetsTip({ onShowBets, suppressed }: { onShowBets: () => void; suppressed: boolean }) {
  const prefs = usePrefs();
  const [due, setDue] = useState(false);

  useEffect(() => {
    if (prefs.betsTipSeen) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // a moment after the save, once the bet ticket has closed
    const onCreated = () => {
      timer = setTimeout(() => setDue(true), 1100);
    };
    window.addEventListener(BET_CREATED_EVENT, onCreated);
    return () => {
      window.removeEventListener(BET_CREATED_EVENT, onCreated);
      if (timer) clearTimeout(timer);
    };
  }, [prefs.betsTipSeen]);

  if (!due || prefs.betsTipSeen || suppressed) return null;

  const retire = () => {
    setDue(false);
    savePrefs({ betsTipSeen: true });
  };

  return (
    <div role="status" className="account-tip absolute right-0 top-full z-50 mt-3 w-60 rounded-xl bg-gray-900 p-3 text-left text-white shadow-lg">
      {/* little arrow up at the button */}
      <span className="absolute -top-1.5 right-6 h-3 w-3 rotate-45 bg-gray-900" />
      <div className="text-sm font-semibold">Saved. Your bets live here</div>
      <p className="mt-1 text-xs leading-snug text-gray-300">
        Tap <span className="font-semibold text-white">Bets</span> for every bet you track, with your record and units. The bets of people you follow are there too.
      </p>
      <div className="mt-2.5 flex justify-end gap-2">
        <button type="button" onClick={retire} className="rounded-md px-2.5 py-1 text-xs font-medium text-gray-300 hover:text-white">
          Got it
        </button>
        <button
          type="button"
          onClick={() => {
            retire();
            onShowBets();
          }}
          className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-500"
        >
          Show me
        </button>
      </div>
    </div>
  );
}
