// src/components/PeopleSheet.tsx
//
// "Friends & profile" ("Find friends" in the account menu), opened from the account menu: edit your own name,
// handle and private switch; find people by name; see who you follow and who
// follows you (approving requests when your account is private). Same sheet
// styling and motion as BetTicket. Data and rules: src/lib/social.ts.
'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSheetClose } from '@/lib/useSheetClose';
import {
  ensureProfile,
  updateProfile,
  searchProfiles,
  listFollowing,
  listFollowers,
  followUser,
  unfollowUser,
  removeFollower,
  approveFollower,
  HANDLE_RULE,
  type Profile,
  type FollowEdge,
} from '@/lib/social';

const field = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
const small = 'rounded-lg px-2.5 py-1 text-xs font-semibold';
const primary = `${small} bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50`;
const quiet = `${small} border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50`;

function Avatar({ p }: { p: Profile }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="flex h-8 w-8 flex-none items-center justify-center overflow-hidden rounded-full bg-blue-600 text-xs font-semibold text-white">
      {p.avatarUrl && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.avatarUrl} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        p.displayName.charAt(0).toUpperCase()
      )}
    </span>
  );
}

function PersonRow({ p, note, children }: { p: Profile; note?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <Avatar p={p} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-gray-900">{p.displayName}</div>
        <div className="truncate text-xs text-gray-500">
          @{p.handle}
          {note ? ` · ${note}` : ''}
        </div>
      </div>
      <div className="flex flex-none items-center gap-1">{children}</div>
    </div>
  );
}

export default function PeopleSheet({ onClose }: { onClose: () => void }) {
  const { closing, close } = useSheetClose(onClose);
  const [me, setMe] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [following, setFollowing] = useState<FollowEdge[]>([]);
  const [followers, setFollowers] = useState<FollowEdge[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Profile[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reloadLists = useCallback(async () => {
    const [a, b] = await Promise.all([listFollowing(), listFollowers()]);
    setFollowing(a);
    setFollowers(b);
  }, []);

  useEffect(() => {
    let alive = true;
    ensureProfile().then((p) => {
      if (!alive) return;
      setMe(p);
      setName(p?.displayName ?? '');
      setHandle(p?.handle ?? '');
      setReady(true);
    });
    reloadLists();
    return () => {
      alive = false;
    };
  }, [reloadLists]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close]);

  // Search as you type, a beat after the last keystroke
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      searchProfiles(query).then((r) => alive && setResults(r));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query]);

  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    setNotice(null);
    try {
      await fn();
      await reloadLists();
    } catch (e) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : 'That did not work.' });
    } finally {
      setBusyId(null);
    }
  };

  const cleanHandle = handle.trim().toLowerCase();
  const profileDirty = !!me && (name.trim() !== me.displayName || cleanHandle !== me.handle);
  const profileValid = name.trim().length >= 1 && name.trim().length <= 40 && HANDLE_RULE.test(cleanHandle);

  const saveProfile = async (patch: Parameters<typeof updateProfile>[0]) => {
    setSaving(true);
    setNotice(null);
    try {
      const p = await updateProfile(patch);
      setMe(p);
      setName(p.displayName);
      setHandle(p.handle);
      setNotice({ ok: true, text: 'Saved.' });
    } catch (e) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : 'Could not save.' });
    } finally {
      setSaving(false);
    }
  };

  const followingIds = new Map(following.map((f) => [f.profile.id, f.status]));
  const requests = followers.filter((f) => f.status === 'pending');
  const accepted = followers.filter((f) => f.status === 'accepted');
  const heading = 'mt-5 mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400';

  return createPortal(
    // React events bubble through portals to the header — stop them here
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Friends and profile"
      data-closing={closing || undefined}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="sheet-backdrop absolute inset-0 bg-black/40" onClick={close} />
      <div className="sheet-panel relative flex max-h-[85vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:w-[420px] sm:rounded-2xl">
        <div className="flex items-center justify-between gap-3 px-4 pt-4">
          <div className="text-[16px] font-semibold tracking-[-0.3px] text-gray-900">Friends &amp; profile</div>
          <button type="button" onClick={close} aria-label="Close" className="-mr-1 flex-none rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto px-4 pb-6 pt-2">
          {ready && !me ? (
            <p className="py-6 text-sm text-gray-600">
              Following isn&apos;t switched on yet. (The database setup in sql/social_follows.sql has not been run.)
            </p>
          ) : (
            <>
              {/* ---- your profile ---- */}
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-600">Name</span>
                  <input type="text" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className={field} aria-label="Display name" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-600">Handle</span>
                  <input type="text" value={handle} maxLength={20} onChange={(e) => setHandle(e.target.value)} className={field} aria-label="Handle" autoCapitalize="none" />
                </label>
              </div>
              {profileDirty && (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-500">
                    {profileValid ? 'People find you by this name and handle.' : 'Handle: 3–20 letters, numbers or underscores.'}
                  </span>
                  <button type="button" className={primary} disabled={!profileValid || saving} onClick={() => saveProfile({ displayName: name, handle: cleanHandle })}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              )}

              <button
                type="button"
                role="switch"
                aria-checked={!!me?.isPrivate}
                disabled={!me || saving}
                onClick={() => me && saveProfile({ isPrivate: !me.isPrivate })}
                className="mt-3 flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-left"
              >
                <span>
                  <span className="block text-sm font-medium text-gray-800">Private account</span>
                  <span className="block text-xs text-gray-500">
                    {me?.isPrivate ? 'New followers need your approval.' : 'Anyone signed in can follow you and see your bets.'}
                  </span>
                </span>
                <span className={`relative h-6 w-10 flex-none rounded-full transition-colors ${me?.isPrivate ? 'bg-green-500' : 'bg-gray-300'}`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${me?.isPrivate ? 'left-[18px]' : 'left-0.5'}`} />
                </span>
              </button>

              {notice && <div className={`mt-2 text-xs ${notice.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{notice.text}</div>}

              {/* ---- requests (private accounts) ---- */}
              {requests.length > 0 && (
                <>
                  <div className={heading}>Follow requests</div>
                  {requests.map(({ profile: p }) => (
                    <PersonRow key={p.id} p={p}>
                      <button type="button" className={primary} disabled={busyId === p.id} onClick={() => act(p.id, () => approveFollower(p.id))}>
                        Approve
                      </button>
                      <button type="button" className={quiet} disabled={busyId === p.id} onClick={() => act(p.id, () => removeFollower(p.id))}>
                        Deny
                      </button>
                    </PersonRow>
                  ))}
                </>
              )}

              {/* ---- find people ---- */}
              <div className={heading}>Find people</div>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or handle"
                className={field}
                aria-label="Search people"
              />
              {query.trim().length >= 2 && results.length === 0 && <div className="py-2 text-xs text-gray-500">No one found.</div>}
              {results.map((p) => {
                const status = followingIds.get(p.id);
                return (
                  <PersonRow key={p.id} p={p} note={p.isPrivate ? 'private' : undefined}>
                    {status ? (
                      <button type="button" className={quiet} disabled={busyId === p.id} onClick={() => act(p.id, () => unfollowUser(p.id))}>
                        {status === 'pending' ? 'Requested' : 'Following'}
                      </button>
                    ) : (
                      <button type="button" className={primary} disabled={busyId === p.id} onClick={() => act(p.id, () => followUser(p.id))}>
                        Follow
                      </button>
                    )}
                  </PersonRow>
                );
              })}

              {/* ---- following ---- */}
              <div className={heading}>Following ({following.length})</div>
              {following.length === 0 && <div className="py-1 text-xs text-gray-500">You don&apos;t follow anyone yet.</div>}
              {following.map(({ profile: p, status }) => (
                <PersonRow key={p.id} p={p} note={status === 'pending' ? 'waiting for approval' : undefined}>
                  <button type="button" className={quiet} disabled={busyId === p.id} onClick={() => act(p.id, () => unfollowUser(p.id))}>
                    {status === 'pending' ? 'Cancel' : 'Unfollow'}
                  </button>
                </PersonRow>
              ))}

              {/* ---- followers ---- */}
              <div className={heading}>Followers ({accepted.length})</div>
              {accepted.length === 0 && <div className="py-1 text-xs text-gray-500">No followers yet.</div>}
              {accepted.map(({ profile: p }) => (
                <PersonRow key={p.id} p={p}>
                  {!followingIds.has(p.id) && (
                    <button type="button" className={primary} disabled={busyId === p.id} onClick={() => act(p.id, () => followUser(p.id))}>
                      Follow back
                    </button>
                  )}
                  <button type="button" className={quiet} disabled={busyId === p.id} onClick={() => act(p.id, () => removeFollower(p.id))}>
                    Remove
                  </button>
                </PersonRow>
              ))}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
