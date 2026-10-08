// src/components/AccountButton.tsx
//
// Header control for a signed-in visitor: a round initial that opens a small
// menu with the account email, display preferences (src/lib/prefs.ts) and Sign out. Rendered by the board header
// next to the Bets button; signed-out visitors get a "Sign in" button there
// instead (see OddsBoard).
'use client';

import { useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { signOut } from '@/lib/userAuth';
import { savePrefs, usePrefs, TIME_ZONES } from '@/lib/prefs';

export default function AccountButton({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const prefs = usePrefs();
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
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
          <div className="truncate px-2 py-1.5 text-xs text-gray-500" title={user.email ?? undefined}>
            {user.email}
          </div>

          <div className="my-1 border-t border-gray-100" />

          {/* iOS-style switch: the Ledger projection chip on game cards */}
          <button
            type="button"
            role="switch"
            aria-checked={prefs.showProjections}
            onClick={() => savePrefs({ showProjections: !prefs.showProjections })}
            className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <span>odds.day projections</span>
            <span
              className={`relative h-6 w-10 flex-none rounded-full transition-colors ${
                prefs.showProjections ? 'bg-green-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  prefs.showProjections ? 'left-[18px]' : 'left-0.5'
                }`}
              />
            </span>
          </button>

          <label className="flex items-center justify-between gap-3 px-2 py-1.5 text-sm font-medium text-gray-700">
            <span>Time zone</span>
            <select
              value={prefs.timeZone ?? ''}
              onChange={(e) => savePrefs({ timeZone: e.target.value || null })}
              className="min-w-0 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm font-normal text-gray-700"
            >
              <option value="">This device</option>
              {TIME_ZONES.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.label}
                </option>
              ))}
            </select>
          </label>

          <div className="my-1 border-t border-gray-100" />
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
