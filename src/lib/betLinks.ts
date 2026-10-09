// src/lib/betLinks.ts
// Deep-link template handling for sportsbooks whose the-odds-api links carry
// placeholders — BetMGM ({state}) and BetRivers ({state}, {pickType},
// {wagerAmount}). The user's state persists in localStorage; set via the
// bookmaker dropdown or prompted on first click.
'use client';

const STATE_KEY = 'betLinkState';

// The board's "tap odds to …" hint is for people who have never tapped a
// price. The first tap on this device retires it for good.
const PRICE_TAPPED_KEY = 'oddsTapHintDone';
export const PRICE_TAPPED_EVENT = 'oddsday:price-tapped';

export function hasTappedPrice(): boolean {
  try {
    return localStorage.getItem(PRICE_TAPPED_KEY) === '1';
  } catch {
    return true; // storage blocked: never nag
  }
}

export function markPriceTapped(): void {
  try {
    if (localStorage.getItem(PRICE_TAPPED_KEY) === '1') return;
    localStorage.setItem(PRICE_TAPPED_KEY, '1');
  } catch {
    /* not remembered */
  }
  window.dispatchEvent(new Event(PRICE_TAPPED_EVENT));
}

// States where BetMGM and/or BetRivers operate online sportsbooks.
export const BET_LINK_STATES = [
  'AZ', 'CO', 'CT', 'DC', 'IA', 'IL', 'IN', 'KS', 'KY', 'LA', 'MA', 'MD',
  'MI', 'NC', 'NJ', 'NV', 'NY', 'OH', 'PA', 'TN', 'VA', 'WV', 'WY',
];

export function getBetState(): string | null {
  if (typeof window === 'undefined') return null;
  const s = localStorage.getItem(STATE_KEY);
  return s && /^[a-z]{2}$/.test(s) ? s : null;
}

export function setBetState(code: string): void {
  const c = code.trim().toLowerCase();
  if (/^[a-z]{2}$/.test(c)) localStorage.setItem(STATE_KEY, c);
}

export function linkNeedsState(link: string): boolean {
  return link.includes('{state}');
}

// Fill the-odds-api link templates: {state} → user's state; coupon params get
// sensible defaults (single pick, no prefilled stake). Novig's outcome links
// end in "/{wager}" (stake) — dropped so the betslip opens with no amount.
export function fillLinkTemplate(link: string, state: string): string {
  return link
    .replaceAll('{state}', state.toLowerCase())
    .replaceAll('{pickType}', 'single')
    .replaceAll('{wagerAmount}', '')
    .replaceAll('{wager}', '');
}

// ProphetX: the feed's bet link (www.prophetx.co/?action=addtobetslip&lineID=…)
// loads the website and never reaches the app's bet slip. The app listens on
// ProphetX's AppsFlyer OneLink instead — same line id, passed as
// deep_link_sub2 — which opens the app with the selection in the slip
// (format confirmed from a working partner link, 2026-10-09). sub1 is the
// partner label. Phones only: on desktop the website link is the right one.
const PROPHETX_ONELINK = 'https://prophetx.onelink.me/E5Yi/autofill';
const PROPHETX_PARTNER = 'OddsDay';

export function prophetxAppLink(url: string): string {
  let u: URL;
  try { u = new URL(url); } catch { return url; }
  const lineId = u.searchParams.get('lineID');
  const isProphetX = u.hostname === 'prophetx.co' || u.hostname.endsWith('.prophetx.co');
  if (!isProphetX || u.searchParams.get('action') !== 'addtobetslip' || !lineId) return url;
  const q = new URLSearchParams({ deep_link_value: 'addtobetslip', deep_link_sub1: PROPHETX_PARTNER, deep_link_sub2: lineId });
  return `${PROPHETX_ONELINK}?${q.toString()}`;
}

// Polymarket: the feed links to polymarket.com, which blocks trading for US
// visitors ("It looks like you're in the US"). Polymarket US lists the same
// games under the same codes at polymarket.us/sports/<league>/<code>, where
// the league is the code's prefix (nfl-phi-jax-2026-10-11 → nfl), so send
// people there instead. Anything that isn't a game page is left alone.
export function polymarketUsLink(url: string): string {
  let u: URL;
  try { u = new URL(url); } catch { return url; }
  if (u.hostname !== 'polymarket.com' && u.hostname !== 'www.polymarket.com') return url;
  const m = u.pathname.match(/^\/event\/(([a-z0-9]+)-[a-z0-9-]+)\/?$/);
  return m ? `https://polymarket.us/sports/${m[2]}/${m[1]}` : url;
}

// Resolve a clickable URL. Returns null when the template needs a state and
// none is stored yet — caller should prompt.
export function resolveDeepLink(link: string): string | null {
  let url: string;
  if (!linkNeedsState(link)) {
    url = fillLinkTemplate(link, '');
  } else {
    const state = getBetState();
    if (!state) return null;
    url = fillLinkTemplate(link, state);
  }
  url = polymarketUsLink(url);
  return isMobileDevice() ? prophetxAppLink(url) : url;
}

// Prompt-and-store fallback for the first click on a templated link.
export function promptForState(): string | null {
  const input = window.prompt('Enter your 2-letter state code for BetMGM/BetRivers links (e.g. AZ):');
  if (!input) return null;
  const c = input.trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(c)) return null;
  setBetState(c);
  return c;
}

// Books whose links are universal links / Android app links (the domain's
// apple-app-site-association + assetlinks.json claim every path). iOS only
// hands those to the app on a same-tab navigation from a tap — a
// window.open(_blank) new tab just loads the website.
const APP_LINK_HOSTS = ['prophetx.co', 'prophetx.onelink.me'];

export function isAppLinkUrl(url: string): boolean {
  let host = '';
  try { host = new URL(url).hostname; } catch { return false; }
  return APP_LINK_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

export function isMobileDevice(): boolean {
  return typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

// On phones an app-link book needs a REAL <a> tap (see appLinkHref) — iOS
// ignores JS navigations to universal links. This is the fallback path.
// `goHref` is the /go/[book] click-out (logs, then 302s to the book);
// `destination` is where it ends up. iOS does NOT open an app from a 302 that
// lands on a universal link, so app-link books on phones navigate straight to
// the destination and the click is logged with a beacon instead.
export function openBetLink(goHref: string, destination?: string): void {
  if (destination && isAppLinkUrl(destination) && isMobileDevice()) {
    logClickBeacon(goHref);
    window.location.href = destination;
  } else {
    window.open(goHref, '_blank', 'noopener,noreferrer');
  }
}

/** Log a click-out without navigating through it: POST /go/[book]?... (204, no redirect). */
export function logClickBeacon(goHref: string): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(goHref);
    } else {
      fetch(goHref, { method: 'POST', keepalive: true }).catch(() => {});
    }
  } catch {
    /* logging is best-effort */
  }
}

/** Href for a real-anchor overlay when this link should open a native app, else null. */
export function appLinkHref(link: string | undefined): string | null {
  if (!link || !isMobileDevice()) return null;
  const url = resolveDeepLink(link);
  return url && isAppLinkUrl(url) ? url : null;
}
