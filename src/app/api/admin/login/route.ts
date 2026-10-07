// src/app/api/admin/login/route.ts
//
// POST { password } → sets the admin cookie when password === ADMIN_SECRET.
// DELETE            → clears it (log out this device).
// The cookie is httpOnly + Secure + SameSite=Lax, one year. See lib/adminAuth.ts.

import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, ADMIN_COOKIE_MAX_AGE, adminToken, safeEqual } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: NextRequest) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Admin login is not configured (ADMIN_SECRET unset).' }, { status: 503 });
  }

  let password = '';
  try {
    const body = await req.json();
    password = typeof body?.password === 'string' ? body.password : '';
  } catch {
    /* fall through with empty password */
  }

  if (!password || !safeEqual(password, secret)) {
    await sleep(400); // blunt the guessing rate
    return NextResponse.json({ error: 'Wrong password.' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: ADMIN_COOKIE,
    value: await adminToken(secret),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ADMIN_COOKIE_MAX_AGE,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: ADMIN_COOKIE, value: '', path: '/', maxAge: 0 });
  return res;
}
