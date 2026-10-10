// src/lib/gameNotes.ts
//
// A private note per game, stored on the account (table game_notes,
// sql/game_notes.sql). One query loads all of a person's notes for the page;
// every game card then reads its own from this shared store.
//
// Until the SQL has been run, loading finds nothing and saving reports that
// notes aren't switched on.
'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import { useUser } from './userAuth';

export const NOTE_MAX = 1000;

const notes = new Map<string, string>();
const listeners = new Set<() => void>();
let loadedFor: string | null = null;

const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

async function load(userId: string) {
  if (loadedFor === userId) return;
  loadedFor = userId;
  notes.clear();
  const { data, error } = await supabase.from('game_notes').select('game_id, note').eq('user_id', userId).limit(1000);
  if (loadedFor !== userId) return; // signed out / switched account meanwhile
  if (!error && data) {
    for (const r of data) notes.set(r.game_id as string, r.note as string);
  }
  emit();
}

function clear() {
  if (loadedFor === null && notes.size === 0) return;
  loadedFor = null;
  notes.clear();
  emit();
}

/** This game's note ('' when there is none) and whether the visitor can have one. */
export function useGameNote(gameId: string): { note: string; canNote: boolean } {
  const { user, ready } = useUser();
  useEffect(() => {
    if (!ready) return;
    if (user) load(user.id);
    else clear();
  }, [ready, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const note = useSyncExternalStore(subscribe, () => notes.get(gameId) ?? '', () => '');
  return { note, canNote: !!user };
}

/**
 * Save (or, with empty text, delete) the note for a game. The matchup label
 * and start time are stored with it so a notes list can be built later
 * without the odds feed.
 */
export async function saveGameNote(gameId: string, text: string, game: { label: string; commenceTime: string }): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error('Sign in to keep notes.');
  const note = text.trim().slice(0, NOTE_MAX);

  const { error } = note
    ? await supabase.from('game_notes').upsert(
        { user_id: userId, game_id: gameId, note, game_label: game.label, commence_time: game.commenceTime, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,game_id' }
      )
    : await supabase.from('game_notes').delete().eq('user_id', userId).eq('game_id', gameId);
  if (error) {
    throw new Error(/game_notes|schema cache|does not exist/i.test(error.message) ? "Notes aren't switched on yet." : error.message);
  }

  if (note) notes.set(gameId, note);
  else notes.delete(gameId);
  emit();
}
