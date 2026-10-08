// src/lib/userAuth.ts
//
// Visitor sign-in (Google, through Supabase Auth). Separate from the admin
// cookie in adminAuth.ts: that one guards the admin tools, this one says
// which person is looking at the site so bets can belong to them.
//
// The session lives in the browser (supabase-js keeps it in localStorage and
// refreshes it), so the server-rendered sport pages stay static. Routes that
// need to know the user get the access token in an Authorization header.
'use client';

import { useSyncExternalStore } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

interface AuthState {
  user: User | null;
  ready: boolean; // false until the stored session has been read
}

// One shared subscription for the whole page — every game card reads the
// user (for preferences), so each hook call must not open its own listener.
const SIGNED_OUT_PENDING: AuthState = { user: null, ready: false };
let state: AuthState = SIGNED_OUT_PENDING;
let started = false;
const listeners = new Set<() => void>();

function set(user: User | null) {
  state = { user, ready: true };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!started) {
    started = true;
    supabase.auth.getSession().then(({ data }) => set(data.session?.user ?? null));
    supabase.auth.onAuthStateChange((_event, session) => set(session?.user ?? null));
  }
  return () => {
    listeners.delete(listener);
  };
}

/** The signed-in user, or null. `ready` is false until the stored session has been read. */
export function useUser(): AuthState {
  return useSyncExternalStore(subscribe, () => state, () => SIGNED_OUT_PENDING);
}

/** Sends the browser to Google; it comes back to the page it left. */
export function signInWithGoogle() {
  const { origin, pathname, search } = window.location;
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${origin}${pathname}${search}` },
  });
}

/** Signs out, then reloads so nothing of the old user's (cached bets, badges) stays on screen. */
export async function signOut() {
  await supabase.auth.signOut();
  window.location.reload();
}
