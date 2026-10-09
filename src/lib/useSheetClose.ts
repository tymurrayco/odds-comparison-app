// src/lib/useSheetClose.ts
//
// Closing for the slide-up sheets (BetTicket, BetEditSheet): flag the sheet as
// closing so its exit animation plays (.sheet-panel / .sheet-backdrop in
// globals.css), then tell the parent to unmount it.
'use client';

import { useCallback, useState } from 'react';

// Matches the exit animations' duration in globals.css
const EXIT_MS = 180;

export function useSheetClose(onClose: () => void): { closing: boolean; close: () => void } {
  const [closing, setClosing] = useState(false);
  const close = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, EXIT_MS);
  }, [onClose]);
  return { closing, close };
}
