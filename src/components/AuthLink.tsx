// src/components/AuthLink.tsx
//
// "Sign in" / "<email> · Sign out" at the end of the footer's meta row
// (brings its own leading dot). Renders nothing until the stored session has
// been read, so the row doesn't flicker.
'use client';

import { signInWithGoogle, signOut, useUser } from '@/lib/userAuth';

const link = 'hover:text-gray-700 hover:underline';

export default function AuthLink() {
  const { user, ready } = useUser();
  if (!ready) return null;

  if (!user) {
    return (
      <>
        <span aria-hidden="true">&middot;</span>
        <button type="button" onClick={() => signInWithGoogle()} className={link}>
          Sign in
        </button>
      </>
    );
  }

  return (
    <>
      <span aria-hidden="true">&middot;</span>
      <span className="text-gray-500">{user.email}</span>
      <span aria-hidden="true">&middot;</span>
      <button type="button" onClick={() => signOut()} className={link}>
        Sign out
      </button>
    </>
  );
}
