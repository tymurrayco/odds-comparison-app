// src/components/BetTicket.tsx
//
// The ticket a signed-in visitor gets when they tap a price: the bet already
// filled in, an amount (Risk / To win), and three actions — track the bet and
// open the sportsbook in one tap, or either on its own. "Open only" leaves
// the ticket up, so they can come back and track what they placed. Bottom sheet on phones, centred card
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

// The amount field is either what you risk or what you want to win; the
// choice is remembered on this device. Either way the bet saves its stake (risk).
type AmountMode = 'risk' | 'towin';
const MODE_KEY = 'betTicketAmountMode';
const MODES: { id: AmountMode; label: string }[] = [
  { id: 'risk', label: 'Risk' },
  { id: 'towin', label: 'To win' },
];

function storedMode(): AmountMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'risk' ? 'risk' : 'towin';
  } catch {
    return 'towin';
  }
}

export default function BetTicket({ pick, onClose }: { pick: TicketPick; onClose: () => void }) {
  const winPerUnit = calculateProfit(1, pick.odds); // profit for each unit risked
  const [mode, setMode] = useState<AmountMode>(storedMode);
  // Default bet: to win 1 unit (the site's unit convention)
  const [amountText, setAmountText] = useState(() => (storedMode() === 'towin' ? '1.00' : (1 / winPerUnit).toFixed(2)));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const amount = Number(amountText);
  const stakeOk = amountText.trim() !== '' && Number.isFinite(amount) && amount > 0;
  const stake = mode === 'risk' ? amount : amount / winPerUnit;
  const toWin = mode === 'risk' ? amount * winPerUnit : amount;

  // Switching keeps the same bet: the field shows it from the other side
  const switchMode = (next: AmountMode) => {
    if (next === mode) return;
    if (stakeOk) setAmountText((next === 'risk' ? stake : toWin).toFixed(2));
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      /* not remembered */
    }
  };

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

  const openProps = appHref
    ? { href: openHref }
    : { href: openHref, target: '_blank', rel: 'noopener noreferrer' };
  const secondary =
    'rounded-xl border border-gray-200 bg-white px-3 py-2 text-center text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50';

  const onTrack = async () => {
    if (!stakeOk || saving || saved) return;
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

        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
          {/* iOS-style segmented switch: is the amount what you risk or what you win? */}
          <div className="flex rounded-lg bg-gray-200/80 p-0.5" role="radiogroup" aria-label="Amount is">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={mode === m.id}
                onClick={() => switchMode(m.id)}
                className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                  mode === m.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              inputMode="decimal"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              onFocus={(e) => e.target.select()}
              className="w-20 rounded-lg border border-gray-200 bg-white px-2 py-1 text-right text-sm font-semibold text-gray-900"
              aria-label={mode === 'risk' ? 'Units to risk' : 'Units to win'}
            />
            <span className="text-sm text-gray-500">u</span>
          </div>
        </div>
        <div className="mt-1 h-4 text-right text-[11px] text-gray-400">
          {stakeOk && (mode === 'risk' ? `To win ${toWin.toFixed(2)}u` : `Risk ${stake.toFixed(2)}u`)}
        </div>

        {/* Both at once on top; each on its own underneath. The two "open"
            actions are real anchors so phones hand app links to the app. */}
        <a
          {...openProps}
          onClick={(e) => {
            if (!stakeOk || saving || saved) {
              e.preventDefault();
              return;
            }
            onOpen(e);
            onTrack();
          }}
          aria-disabled={!stakeOk || saving}
          className={`mt-2 block rounded-xl px-3 py-2.5 text-center text-sm font-semibold shadow-sm ${
            saved
              ? 'bg-emerald-50 text-emerald-700'
              : `bg-blue-600 text-white hover:bg-blue-700 ${!stakeOk || saving ? 'opacity-50' : ''}`
          }`}
        >
          {saved ? 'Tracked ✓' : saving ? 'Saving…' : `Track + open ${pick.book}`}
        </a>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <a {...openProps} onClick={onOpen} className={secondary}>
            Open only
          </a>
          <button type="button" onClick={onTrack} disabled={!stakeOk || saving || saved} className={`${secondary} disabled:opacity-50`}>
            Track only
          </button>
        </div>
        {error && <div className="mt-2 text-xs text-rose-600">{error}</div>}
      </div>
    </div>,
    document.body
  );
}
