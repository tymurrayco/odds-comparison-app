// src/components/ThemeApplier.tsx
//
// Keeps <html data-theme> in step with the account's Dark mode switch
// (prefs.darkMode; the colours are the dark block in globals.css). The choice
// is mirrored to localStorage so the small script in layout.tsx can apply it
// before the first paint on the next visit. Signed out there is no switch, so
// the site goes back to light.
//
// Dark mode also swaps team logos for ESPN's dark-background versions (see
// useDarkLogos): black and navy marks like West Virginia's or Wake Forest's
// vanish on a dark card otherwise.
'use client';

import { useEffect } from 'react';
import { usePrefs } from '@/lib/prefs';
import { useUser } from '@/lib/userAuth';

export const THEME_KEY = 'oddsdayTheme';

// ESPN serves every team logo twice: .../teamlogos/<league>/500/<team>.png and
// a recoloured .../500-dark/... for dark backgrounds.
const ESPN_LOGO = /(espncdn[.]com[/].*i[/]teamlogos[/][a-z0-9-]+[/]500)[/]/i;
const darkUrl = (src: string): string | null => {
  if (src.includes('/500-dark/')) return null;
  const dark = src.replace(ESPN_LOGO, '$1-dark/');
  return dark === src ? null : dark;
};

// light URL → its dark URL once that is known to load, or null when ESPN has none
const darkLogoCache = new Map<string, Promise<string | null>>();
function resolveDark(src: string): Promise<string | null> {
  let known = darkLogoCache.get(src);
  if (!known) {
    const dark = darkUrl(src);
    known = !dark
      ? Promise.resolve(null)
      : new Promise((resolve) => {
          // Tried off the page first, so a missing dark logo never fires the
          // real image's own error handling (some hide the logo on error)
          const probe = new Image();
          probe.onload = () => resolve(dark);
          probe.onerror = () => resolve(null);
          probe.src = dark;
        });
    darkLogoCache.set(src, known);
  }
  return known;
}

/**
 * While dark mode is on, every ESPN team logo on the page — whichever
 * component drew it, now or later — is pointed at its dark version. Logos
 * are drawn in dozens of places, so this watches the page instead of
 * touching each one. Turning dark mode off puts the originals back.
 */
function useDarkLogos(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const swap = (img: HTMLImageElement) => {
      const src = img.getAttribute('src');
      if (!src || !ESPN_LOGO.test(src) || src.includes('/500-dark/')) return;
      resolveDark(src).then((dark) => {
        // still showing the same logo, and dark mode not switched off meanwhile
        if (!dark || !observing || img.getAttribute('src') !== src) return;
        img.dataset.lightLogo = src;
        img.setAttribute('src', dark);
      });
    };
    const scan = (root: ParentNode) => root.querySelectorAll<HTMLImageElement>('img[src*="teamlogos"]').forEach(swap);

    let observing = true;
    const observer = new MutationObserver((changes) => {
      for (const change of changes) {
        if (change.type === 'attributes') {
          if (change.target instanceof HTMLImageElement) swap(change.target);
          continue;
        }
        change.addedNodes.forEach((node) => {
          if (node instanceof HTMLImageElement) swap(node);
          else if (node instanceof Element) scan(node);
        });
      }
    });
    scan(document);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });

    return () => {
      observing = false;
      observer.disconnect();
      document.querySelectorAll<HTMLImageElement>('img[data-light-logo]').forEach((img) => {
        const light = img.dataset.lightLogo!;
        if (img.getAttribute('src') === darkUrl(light)) img.setAttribute('src', light);
        delete img.dataset.lightLogo;
      });
    };
  }, [on]);
}

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

  useDarkLogos(ready && darkMode);

  return null;
}
