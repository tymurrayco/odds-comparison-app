// src/components/BetEditSheet.tsx
//
// Edit one of your own bets from the Bets view: the bet text (e.g. add "1H"),
// odds, stake, result, or delete it. Same sheet styling as BetTicket — bottom
// sheet on phones, centred card on desktop. Saves through /api/bets, which
// only lets the signed-in owner change a bet.
'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { updateBet, deleteBet, type Bet, type BetStatus } from '@/lib/betService';
import { useSheetClose } from '@/lib/useSheetClose';

const STATUSES: { id: BetStatus; label: string; on: string }[] = [
  { id: 'pending', label: 'Pending', on: 'bg-white text-gray-900 shadow-sm' },
  { id: 'won', label: 'Won', on: 'bg-emerald-600 text-white shadow-sm' },
  { id: 'lost', label: 'Lost', on: 'bg-rose-600 text-white shadow-sm' },
  { id: 'push', label: 'Push', on: 'bg-gray-600 text-white shadow-sm' },
];

const field = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

export default function BetEditSheet({
  bet,
  onClose,
  onSaved,
  onDeleted,
}: {
  bet: Bet;
  onClose: () => void;
  onSaved: (updated: Bet) => void;
  onDeleted: (id: string) => void;
}) {
  const [text, setText] = useState(bet.bet);
  const [oddsText, setOddsText] = useState(String(bet.odds));
  const [stakeText, setStakeText] = useState(String(bet.stake));
  const [status, setStatus] = useState<BetStatus>(bet.status);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { closing, close } = useSheetClose(onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close]);

  const odds = Number(oddsText);
  const stake = Number(stakeText);
  // American odds: a whole number at or beyond ±100
  const oddsOk = oddsText.trim() !== '' && Number.isInteger(odds) && Math.abs(odds) >= 100;
  const stakeOk = stakeText.trim() !== '' && Number.isFinite(stake) && stake > 0;
  const valid = text.trim() !== '' && oddsOk && stakeOk;

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const updates: Partial<Bet> = { bet: text.trim(), odds, stake, status };
    try {
      await updateBet(bet.id, updates);
      onSaved({ ...bet, ...updates });
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the bet');
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteBet(bet.id);
      onDeleted(bet.id);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the bet');
      setBusy(false);
    }
  };

  return createPortal(
    // React events bubble through portals to the bet row — stop them here
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      data-closing={closing || undefined}
      aria-label="Edit bet"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="sheet-backdrop absolute inset-0 bg-black/40" onClick={close} />
      <div className="sheet-panel relative w-full rounded-t-2xl bg-white p-4 pb-6 shadow-xl sm:w-[380px] sm:rounded-2xl sm:pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[16px] font-semibold tracking-[-0.3px] text-gray-900">Edit bet</div>
            <div className="mt-0.5 truncate text-xs text-gray-500">
              {bet.description}{bet.book ? ` · ${bet.book}` : ''}
            </div>
          </div>
          <button type="button" onClick={close} aria-label="Close" className="-mr-1 -mt-1 flex-none rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-medium text-gray-600">Bet</span>
          <input type="text" value={text} onChange={(e) => setText(e.target.value)} className={field} aria-label="Bet" />
        </label>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Odds</span>
            {/* text, not a number keypad: iOS decimal keypads have no minus key */}
            <input type="text" value={oddsText} onChange={(e) => setOddsText(e.target.value.replace(/[−–—]/g, '-'))} className={field} aria-label="Odds" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Stake (units risked)</span>
            <input type="text" inputMode="decimal" value={stakeText} onChange={(e) => setStakeText(e.target.value)} className={field} aria-label="Stake" />
          </label>
        </div>

        <div className="mt-3">
          <span className="mb-1 block text-xs font-medium text-gray-600">Result</span>
          <div className="grid grid-cols-4 rounded-lg bg-gray-200/80 p-0.5" role="radiogroup" aria-label="Result">
            {STATUSES.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={status === s.id}
                onClick={() => setStatus(s.id)}
                className={`rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${status === s.id ? s.on : 'text-gray-500'}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="mt-3 text-xs text-rose-600">{error}</div>}

        <div className="mt-4 flex items-center gap-2">
          {confirmDelete ? (
            <>
              <button type="button" onClick={remove} disabled={busy} className="rounded-xl bg-rose-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50">
                Delete bet
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} disabled={busy} className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
                Keep
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setConfirmDelete(true)} disabled={busy} className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-rose-600 shadow-sm hover:bg-rose-50">
                Delete
              </button>
              <button type="button" onClick={save} disabled={!valid || busy} className="flex-1 rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">
                {busy ? 'Saving…' : 'Save'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
