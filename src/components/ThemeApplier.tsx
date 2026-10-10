// src/components/ThemeApplier.tsx
//
// Keeps <html data-theme> in step with the account's Dark mode switch
// (prefs.darkMode; the colours are the dark block in globals.css). The choice
// is mirrored to localStorage so the small script in layout.tsx can apply it
// before the first paint on the next visit. Signed out there is no switch, so
// the site goes back to light.
'use client';

import { useEffect } from 'react';
import { usePrefs } from '@/lib/prefs';
import { useUser } from '@/lib/userAuth';

export const THEME_KEY = 'oddsdayTheme';

export default function ThemeApplier() {
  const { ready } = useUser();
  const { darkMode } = usePrefs();

  useEffect(() => {
    if (!ready) return; // until the session is read, keep what the layout script applied
    const root = document.documentElement;
    if (darkMode) root.dataset.theme = 'dark';
    else delete root.dataset.theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', darkMode ? '#141b2b' : '#ffffff');
    try {
      if (darkMode) localStorage.setItem(THEME_KEY, 'dark');
      else localStorage.removeItem(THEME_KEY);
    } catch {
      /* the next visit starts light and switches after sign-in loads */
    }
  }, [ready, darkMode]);

  return null;
}
