// src/lib/betLinks.ts
// Deep-link template handling for sportsbooks whose the-odds-api links carry
// placeholders — BetMGM ({state}) and BetRivers ({state}, {pickType},
// {wagerAmount}). The user's state persists in localStorage; set via the
// bookmaker dropdown or prompted on first click.
'use client';

const STATE_KEY = 'betLinkState';

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
// sensible defaults (single pick, no prefilled stake).
export function fillLinkTemplate(link: string, state: string): string {
  return link
    .replaceAll('{state}', state.toLowerCase())
    .replaceAll('{pickType}', 'single')
    .replaceAll('{wagerAmount}', '');
}

// Resolve a clickable URL. Returns null when the template needs a state and
// none is stored yet — caller should prompt.
export function resolveDeepLink(link: string): string | null {
  if (!linkNeedsState(link)) return link;
  const state = getBetState();
  return state ? fillLinkTemplate(link, state) : null;
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
