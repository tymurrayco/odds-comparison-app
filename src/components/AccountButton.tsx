// src/components/AccountButton.tsx
//
// Header control for a signed-in visitor: a round initial that opens a small
// menu with the account email and Sign out. Rendered by the board header
// next to the Bets button; signed-out visitors get a "Sign in" button there
// instead (see OddsBoard).
'use client';

import { useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { signOut } from '@/lib/userAuth';

export default function AccountButton({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on a tap/click anywhere outside the menu
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const initial = (user.email ?? '?').charAt(0).toUpperCase();

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Account"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-blue-600 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
          <div className="truncate px-2 py-1.5 text-xs text-gray-500" title={user.email ?? undefined}>
            {user.email}
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              signOut();
            }}
            className="w-full rounded-lg px-2 py-1.5 text-left text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
