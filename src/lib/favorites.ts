// src/lib/favorites.ts
//
// Starred games, stored on the account (table favorite_games,
// sql/favorite_games.sql) so they follow the person across devices. The
// board still keeps a copy in localStorage: it is the whole store for
// signed-out visitors and an instant-paint cache for signed-in ones.
//
// Until the SQL has been run every call here fails quietly and stars stay
// device-only, as before.
'use client';

import { supabase } from './supabase';

const LIST_KEY = 'favoriteGames';
// Which account the list in localStorage belongs to (absent = starred while signed out)
const OWNER_KEY = 'favoriteGamesOwner';
// Starred games are short-lived; rows this old are for games long over
const STALE_DAYS = 30;

export function readLocalFavorites(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LIST_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function writeLocalFavorites(ids: string[]): void {
  try {
    localStorage.setItem(LIST_KEY, JSON.stringify(ids));
  } catch {
    /* storage unavailable */
  }
}

/**
 * The account's starred games, merged with this device's list.
 *  - stars made while signed out are added to the account (once);
 *  - a list that already belongs to this account is replaced by the account's
 *    (so un-starring on one device isn't undone by another);
 *  - a list left by a different account is discarded.
 * Returns null when the account store isn't reachable (keep the local list).
 */
export async function syncFavorites(userId: string): Promise<string[] | null> {
  const { data, error } = await supabase.from('favorite_games').select('game_id').eq('user_id', userId).limit(1000);
  if (error || !data) return null;
  const remote = data.map((r) => r.game_id as string);

  let owner: string | null = null;
  try {
    owner = localStorage.getItem(OWNER_KEY);
  } catch {
    /* storage unavailable */
  }

  let merged = remote;
  if (!owner) {
    const local = readLocalFavorites();
    const toUpload = local.filter((id) => !remote.includes(id));
    if (toUpload.length) {
      await supabase.from('favorite_games').upsert(
        toUpload.map((game_id) => ({ user_id: userId, game_id })),
        { onConflict: 'user_id,game_id', ignoreDuplicates: true }
      );
      merged = [...remote, ...toUpload];
    }
  }

  try {
    localStorage.setItem(OWNER_KEY, userId);
  } catch {
    /* storage unavailable */
  }
  writeLocalFavorites(merged);

  // Housekeeping, not awaited: drop stars for games long finished
  const cutoff = new Date(Date.now() - STALE_DAYS * 86_400_000).toISOString();
  supabase.from('favorite_games').delete().eq('user_id', userId).lt('created_at', cutoff).then(() => {});

  return merged;
}

/** Signed out: a list that belonged to an account must not stay on the device. Returns the list to show. */
export function favoritesWhenSignedOut(): string[] {
  try {
    if (localStorage.getItem(OWNER_KEY)) {
      localStorage.removeItem(OWNER_KEY);
      localStorage.removeItem(LIST_KEY);
      return [];
    }
  } catch {
    /* storage unavailable */
  }
  return readLocalFavorites();
}

export async function saveFavorite(userId: string, gameId: string, starred: boolean): Promise<void> {
  const q = starred
    ? supabase.from('favorite_games').upsert({ user_id: userId, game_id: gameId }, { onConflict: 'user_id,game_id', ignoreDuplicates: true })
    : supabase.from('favorite_games').delete().eq('user_id', userId).eq('game_id', gameId);
  const { error } = await q;
  if (error) console.warn('[favorites] not saved to the account:', error.message);
}
