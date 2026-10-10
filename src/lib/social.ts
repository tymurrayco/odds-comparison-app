// src/lib/social.ts
//
// Following. One-way, like X: follow someone to see their bets; they see
// yours only if they follow you. Open by default — a private account makes
// new followers wait for approval. Tables, rules and the three RPCs are in
// sql/social_follows.sql; everything here runs in the browser with the
// visitor's own session, so the database decides what they may see.
//
// Until that SQL has been run every call here fails quietly (empty lists,
// null profile) and the site behaves as it did before following existed.
'use client';

import { supabase } from './supabase';

export interface Profile {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  isPrivate: boolean;
}

export type FollowStatus = 'accepted' | 'pending';

export interface FollowEdge {
  profile: Profile;
  status: FollowStatus;
}

interface ProfileRow {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  is_private: boolean;
}

const PROFILE_COLS = 'id, handle, display_name, avatar_url, is_private';

const toProfile = (r: ProfileRow): Profile => ({
  id: r.id,
  handle: r.handle,
  displayName: r.display_name,
  avatarUrl: r.avatar_url,
  isPrivate: r.is_private,
});

async function myId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

// One profile check per page load: creates the caller's profile on their
// first visit after following shipped (name + picture from Google).
let mine: Promise<Profile | null> | null = null;

export function ensureProfile(): Promise<Profile | null> {
  if (!mine) {
    mine = (async () => {
      if (!(await myId())) return null;
      const { data, error } = await supabase.rpc('ensure_profile');
      if (error || !data) return null;
      return toProfile(data as ProfileRow);
    })();
  }
  return mine;
}

/** Forget the cached profile (after sign-in / sign-out or an edit). */
export function resetProfileCache() {
  mine = null;
}

export const HANDLE_RULE = /^[a-z0-9_]{3,20}$/;

export async function updateProfile(patch: { displayName?: string; handle?: string; isPrivate?: boolean }): Promise<Profile> {
  const id = await myId();
  if (!id) throw new Error('Sign in first.');
  const row: Partial<ProfileRow> = {};
  if (patch.displayName !== undefined) row.display_name = patch.displayName.trim();
  if (patch.handle !== undefined) row.handle = patch.handle.trim().toLowerCase();
  if (patch.isPrivate !== undefined) row.is_private = patch.isPrivate;
  const { data, error } = await supabase.from('profiles').update(row).eq('id', id).select(PROFILE_COLS).limit(1);
  if (error) {
    throw new Error(error.code === '23505' ? 'That handle is taken.' : error.message);
  }
  if (!data || data.length === 0) throw new Error('Profile not found.');
  const p = toProfile(data[0] as ProfileRow);
  mine = Promise.resolve(p);
  return p;
}

/** People whose name or handle contains the text (never matched on email). Excludes the caller. */
export async function searchProfiles(text: string): Promise<Profile[]> {
  const q = text.trim().replace(/[%_,()]/g, '');
  const id = await myId();
  if (!id || q.length < 2) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLS)
    .or(`handle.ilike.%${q}%,display_name.ilike.%${q}%`)
    .neq('id', id)
    .order('display_name')
    .limit(12);
  if (error || !data) return [];
  return (data as ProfileRow[]).map(toProfile);
}

/** Everyone the caller follows (accepted and still-pending). */
export async function listFollowing(): Promise<FollowEdge[]> {
  const id = await myId();
  if (!id) return [];
  const { data, error } = await supabase
    .from('follows')
    .select(`status, profile:profiles!follows_followee_id_fkey(${PROFILE_COLS})`)
    .eq('follower_id', id)
    .order('created_at');
  if (error || !data) return [];
  return (data as unknown as { status: FollowStatus; profile: ProfileRow | null }[])
    .filter((r) => r.profile)
    .map((r) => ({ status: r.status, profile: toProfile(r.profile!) }));
}

/** Everyone who follows the caller (accepted, and pending requests when private). */
export async function listFollowers(): Promise<FollowEdge[]> {
  const id = await myId();
  if (!id) return [];
  const { data, error } = await supabase
    .from('follows')
    .select(`status, profile:profiles!follows_follower_id_fkey(${PROFILE_COLS})`)
    .eq('followee_id', id)
    .order('created_at');
  if (error || !data) return [];
  return (data as unknown as { status: FollowStatus; profile: ProfileRow | null }[])
    .filter((r) => r.profile)
    .map((r) => ({ status: r.status, profile: toProfile(r.profile!) }));
}

/** Follow someone. Resolves to 'accepted', or 'pending' when their account is private. */
export async function followUser(targetId: string): Promise<FollowStatus> {
  const { data, error } = await supabase.rpc('follow_user', { target: targetId });
  if (error) throw new Error(error.message);
  return data as FollowStatus;
}

export async function unfollowUser(targetId: string): Promise<void> {
  const id = await myId();
  if (!id) return;
  const { error } = await supabase.from('follows').delete().eq('follower_id', id).eq('followee_id', targetId);
  if (error) throw new Error(error.message);
}

/** Remove one of your followers, or deny their pending request. */
export async function removeFollower(followerId: string): Promise<void> {
  const id = await myId();
  if (!id) return;
  const { error } = await supabase.from('follows').delete().eq('follower_id', followerId).eq('followee_id', id);
  if (error) throw new Error(error.message);
}

export async function approveFollower(followerId: string): Promise<void> {
  const { error } = await supabase.rpc('approve_follower', { follower: followerId });
  if (error) throw new Error(error.message);
}
