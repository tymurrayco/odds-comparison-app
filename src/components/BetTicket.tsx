// src/components/BetTicket.tsx
//
// The ticket a signed-in visitor gets when they tap a price: the bet already
// filled in, a stake, and two actions — open the sportsbook, or track the bet
// in their own list. Opening the book leaves the ticket up, so they can come
// back and track what they just placed. Bottom sheet on phones, centred card
// on desktop. Signed-out visitors never see it (a tap goes straight to the book).
'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { createBet, calculateProfit, type Bet } from '@/lib/betService';
import { formatOdds } from '@/lib/utils';
import {
  resolveDeepLink,
  fillLinkTemplate,
  promptForState,
  openBetLink,
  logClickBeacon,
  isAppLinkUrl,
  isMobileDevice,
} from '@/lib/betLinks';

export interface TicketPick {
  title: string;     // "Kansas City Chiefs -3.5"
  subtitle: string;  // "Buffalo Bills @ Kansas City Chiefs"
  odds: number;
  book: string;
  bookLogo?: string;
  /** The bet to save, minus the stake the visitor chooses here. */
  draft: Omit<Bet, 'id' | 'stake'>;
  /** Raw deep link from the odds feed (may be a {state} template); none = book home page. */
  link?: string;
  /** /go/[book] click-out URL for a resolved destination. */
  buildGo: (to?: string) => string;
}

// Default stake: risk enough to win 1 unit (the site's unit convention)
function stakeToWinOne(odds: number): number {
  return odds > 0 ? 100 / odds : Math.abs(odds) / 100;
}

export default function BetTicket({ pick, onClose }: { pick: TicketPick; onClose: () => void }) {
  const [stakeText, setStakeText] = useState(() => stakeToWinOne(pick.odds).toFixed(2));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const stake = Number(stakeText);
  const stakeOk = stakeText.trim() !== '' && Number.isFinite(stake) && stake > 0;

  // Where "Open in <book>" goes. App-link books on phones need a real same-tab
  // anchor straight at the app link (see betLinks.ts); everything else opens
  // the logged /go click-out in a new tab. null = template still needs a state.
  const resolved = pick.link ? resolveDeepLink(pick.link) : undefined;
  const appHref = resolved && isAppLinkUrl(resolved) && isMobileDevice() ? resolved : null;
  const openHref = appHref ?? pick.buildGo(resolved ?? undefined);

  const onOpen = (e: React.MouseEvent) => {
    if (pick.link && resolved === null) {
      // BetMGM / BetRivers: ask for the state once, then go
      e.preventDefault();
      const state = promptForState();
      if (!state) return;
      const filled = fillLinkTemplate(pick.link, state);
      openBetLink(pick.buildGo(filled), filled);
    } else if (appHref) {
      logClickBeacon(pick.buildGo(appHref));
    }
  };

  const onTrack = async () => {
    if (!stakeOk || saving) return;
    setSaving(true);
    setError(null);
    try {
      await createBet({ ...pick.draft, stake: parseFloat(stake.toFixed(2)) });
      setSaved(true);
      setTimeout(onClose, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the bet');
      setSaving(false);
    }
  };

  return createPortal(
    // React events bubble through portals to the table and game card — stop them here
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Bet ticket"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full rounded-t-2xl bg-white p-4 pb-6 shadow-xl sm:w-[360px] sm:rounded-2xl sm:pb-4">
        <div className="flex items-start gap-3">
          {pick.bookLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pick.bookLogo} alt="" className="mt-0.5 h-8 w-8 flex-none rounded-lg object-contain" />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-semibold leading-tight tracking-[-0.3px] text-gray-900">
              {pick.title} <span className="font-bold text-blue-600">{formatOdds(pick.odds)}</span>
            </div>
            <div className="mt-0.5 truncate text-xs text-gray-500">
              {pick.subtitle} &middot; {pick.book}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 -mt-1 flex-none rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <label className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
          <span className="text-sm font-medium text-gray-700">Stake (units)</span>
          <input
            type="text"
            inputMode="decimal"
            value={stakeText}
            onChange={(e) => setStakeText(e.target.value)}
            onFocus={(e) => e.target.select()}
            className="w-24 rounded-lg border border-gray-200 bg-white px-2 py-1 text-right text-sm font-semibold text-gray-900"
            aria-label="Stake in units"
          />
        </label>
        <div className="mt-1 h-4 text-right text-[11px] text-gray-400">
          {stakeOk && `To win ${calculateProfit(stake, pick.odds).toFixed(2)}u`}
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <a
            href={openHref}
            target={appHref ? undefined : '_blank'}
            rel={appHref ? undefined : 'noopener noreferrer'}
            onClick={onOpen}
            className="rounded-xl bg-blue-600 px-3 py-2.5 text-center text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            Open in {pick.book}
          </a>
          <button
            type="button"
            onClick={onTrack}
            disabled={!stakeOk || saving}
            className={`rounded-xl border px-3 py-2.5 text-sm font-semibold shadow-sm ${
              saved
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50 disabled:opacity-50'
            }`}
          >
            {saved ? 'Tracked ✓' : saving ? 'Saving…' : 'Track bet'}
          </button>
        </div>
        {error && <div className="mt-2 text-xs text-rose-600">{error}</div>}
      </div>
    </div>,
    document.body
  );
}
