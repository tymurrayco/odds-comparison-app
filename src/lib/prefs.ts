// src/lib/prefs.ts
//
// Per-user display preferences, set from the account menu:
//   showProjections — the Ledger (odds.day's own) projection chip on game cards
//   timeZone        — show game times in this zone instead of the device's
//   showFriendBets  — badges on game cards for bets of people you follow
//   darkMode        — the dark colour theme (ThemeApplier + the dark block in globals.css)
//   accountTipSeen  — the one-time "settings and friends are here" pointer was shown
//   betsTipSeen     — the one-time "your bets live here" pointer (first tracked bet) was shown
// Stored on the Supabase Auth user (user_metadata.prefs), so they follow the
// account across devices with no table of their own. Signed-out visitors get
// the defaults.
'use client';

import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import { useUser } from './userAuth';

export interface Prefs {
  showProjections: boolean;
  timeZone: string | null; // IANA name; null = the device's zone
  showFriendBets: boolean;
  accountTipSeen: boolean;
  betsTipSeen: boolean;
  darkMode: boolean;
}

export const DEFAULT_PREFS: Prefs = { showProjections: true, timeZone: null, showFriendBets: true, accountTipSeen: true, betsTipSeen: true, darkMode: false };

export const TIME_ZONES: { id: string; label: string }[] = [
  { id: 'America/New_York', label: 'Eastern' },
  { id: 'America/Chicago', label: 'Central' },
  { id: 'America/Denver', label: 'Mountain' },
  { id: 'America/Phoenix', label: 'Arizona' },
  { id: 'America/Los_Angeles', label: 'Pacific' },
  { id: 'America/Anchorage', label: 'Alaska' },
  { id: 'Pacific/Honolulu', label: 'Hawaii' },
  { id: 'UTC', label: 'UTC' },
];

// A change shows at once; the save to the account follows. `pending` holds
// the not-yet-confirmed values on top of what the account says.
let pending: Partial<Prefs> = {};
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const NONE: Partial<Prefs> = {};

function fromMetadata(meta: unknown): Prefs {
  const p = (meta as { prefs?: Partial<Prefs> } | null | undefined)?.prefs ?? {};
  return {
    showProjections: p.showProjections !== false,
    timeZone: typeof p.timeZone === 'string' && p.timeZone ? p.timeZone : null,
    showFriendBets: p.showFriendBets !== false,
    accountTipSeen: p.accountTipSeen === true,
    betsTipSeen: p.betsTipSeen === true,
    darkMode: p.darkMode === true,
  };
}

export function usePrefs(): Prefs {
  const { user } = useUser();
  const local = useSyncExternalStore(subscribe, () => pending, () => NONE);
  if (!user) return DEFAULT_PREFS;
  return { ...fromMetadata(user.user_metadata), ...local };
}

export async function savePrefs(patch: Partial<Prefs>): Promise<void> {
  pending = { ...pending, ...patch };
  listeners.forEach((l) => l());
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return;
  const { error } = await supabase.auth.updateUser({
    data: { prefs: { ...fromMetadata(user.user_metadata), ...pending } },
  });
  if (error) console.warn('[prefs] not saved:', error.message);
}

/** Spread into toLocale*String / Intl options: pins the zone when one is chosen. */
export function zoneOption(timeZone: string | null): { timeZone?: string } {
  return timeZone ? { timeZone } : {};
}
