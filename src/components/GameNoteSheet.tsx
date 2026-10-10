// src/components/GameNoteSheet.tsx
//
// Write or edit your private note on a game. Same slide-up sheet as the bet
// ticket. Saving empty text removes the note. Storage: src/lib/gameNotes.ts.
'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSheetClose } from '@/lib/useSheetClose';
import { saveGameNote, NOTE_MAX } from '@/lib/gameNotes';

export default function GameNoteSheet({
  gameId,
  label,
  commenceTime,
  initial,
  onClose,
}: {
  gameId: string;
  label: string;
  commenceTime: string;
  initial: string;
  onClose: () => void;
}) {
  const { closing, close } = useSheetClose(onClose);
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close]);

  // Cursor at the end of an existing note, once the sheet has slid in
  useEffect(() => {
    const t = setTimeout(() => {
      const el = boxRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }, 350);
    return () => clearTimeout(t);
  }, []);

  const save = async (value: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await saveGameNote(gameId, value, { label, commenceTime });
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the note');
      setBusy(false);
    }
  };

  const changed = text.trim() !== initial.trim();

  return createPortal(
    // React events bubble through portals to the game card — stop them here
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Game note"
      data-closing={closing || undefined}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="sheet-backdrop absolute inset-0 bg-black/40" onClick={close} />
      <div className="sheet-panel relative w-full rounded-t-2xl bg-white p-4 pb-6 shadow-xl sm:w-[420px] sm:rounded-2xl sm:pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[16px] font-semibold tracking-[-0.3px] text-gray-900">Note</div>
            <div className="mt-0.5 truncate text-xs text-gray-500">{label} &middot; only you can see this</div>
          </div>
          <button type="button" onClick={close} aria-label="Close" className="-mr-1 -mt-1 flex-none rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <textarea
          ref={boxRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={NOTE_MAX}
          rows={5}
          placeholder="Injury news, a number you're waiting for, why you like a side…"
          className="mt-3 w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm leading-snug text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          aria-label="Note"
        />
        {error && <div className="mt-1 text-xs text-rose-600">{error}</div>}

        <div className="mt-3 flex items-center gap-2">
          {initial && (
            <button type="button" onClick={() => save('')} disabled={busy} className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-rose-600 shadow-sm hover:bg-rose-50 disabled:opacity-50">
              Delete
            </button>
          )}
          <button type="button" onClick={() => save(text)} disabled={busy || !changed} className="flex-1 rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
