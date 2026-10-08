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

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

/** The signed-in user, or null. `ready` is false until the stored session has been read. */
export function useUser(): { user: User | null; ready: boolean } {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setUser(data.session?.user ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setReady(true);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { user, ready };
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
