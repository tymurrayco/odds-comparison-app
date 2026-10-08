// src/middleware.ts
//
// The one lock on every back door. Runs on /admin pages and /api routes:
//   - /admin/*            → no admin cookie → redirect to /login
//   - /api/* writes       → POST/PUT/PATCH/DELETE need the admin cookie (404 otherwise)
//   - cron GET routes     → Vercel's `Authorization: Bearer $CRON_SECRET`, or the admin cookie
//   - admin-only GET routes (credit-burning / credit readout) → admin cookie
// Public GETs (odds, props, futures, scores, matchups, team pages, /go) are untouched.
//
// Safety valve: with ADMIN_SECRET unset the site behaves exactly as before
// this file existed (everything open), so a deploy before the env var is set
// can't lock anyone out. Same for CRON_SECRET and the cron routes.
// `next dev` is also left open so local admin work needs no login.

import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/adminAuth';

// GET routes Vercel's scheduler hits (vercel.json crons). Each does real work
// (Odds API credits, Supabase writes, Discord posts).
const CRON_PATHS = new Set([
  '/api/send-nhl-rest',
  '/api/eckel/cron',
  '/api/fbs/snapshot',
  '/api/nfl/snapshot',
  '/api/line-openers/capture',
  '/api/bets/settle',
]);

// GET routes that only admin tools call and that cost credits or reveal them.
const ADMIN_GET_PATHS = new Set([
  '/api/ratings/historical-odds', // 10+ credits per hit, caller-chosen date
  '/api/credit-usage',            // Bet Admin fuel gauge
]);

// Writes that skip the admin gate (the /go beacon lives outside /api).
const PUBLIC_WRITE_PATHS = new Set<string>([
  '/api/admin/login',
  '/api/bets', // any signed-in visitor; the route checks their Supabase token itself
]);

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// /nfl used to be the NFL Ledger page (moved to /nfl/ratings on 2026-10-06
// when /nfl became the server-rendered odds board). Old shared links carry
// one of these ?view= values; the board's own views (games/futures/props)
// are not in the list.
const NFL_LEDGER_VIEWS = new Set(['ratings', 'upcoming', 'ledger', 'totals', 'sos', 'history', 'survivor']);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === '/nfl') {
    const view = req.nextUrl.searchParams.get('view');
    if (view && NFL_LEDGER_VIEWS.has(view)) {
      const url = req.nextUrl.clone();
      url.pathname = '/nfl/ratings';
      return NextResponse.redirect(url, 308);
    }
    return NextResponse.next();
  }

  if (!process.env.ADMIN_SECRET) return NextResponse.next();
  if (process.env.NODE_ENV === 'development') return NextResponse.next();

  const method = req.method.toUpperCase();

  // Admin pages: send strangers to the login page, remember where they were going
  if (pathname.startsWith('/admin')) {
    if (await isAdminRequest(req)) return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }

  if (!pathname.startsWith('/api/')) return NextResponse.next();
  if (PUBLIC_WRITE_PATHS.has(pathname)) return NextResponse.next();

  const isWrite = !READ_METHODS.has(method);
  const isCron = CRON_PATHS.has(pathname) && method === 'GET';
  const isAdminGet = ADMIN_GET_PATHS.has(pathname) && method === 'GET';
  if (!isWrite && !isCron && !isAdminGet) return NextResponse.next();

  if (isCron) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) return NextResponse.next(); // not configured yet → open, as before
    if (req.headers.get('authorization') === `Bearer ${cronSecret}`) return NextResponse.next();
  }

  if (await isAdminRequest(req)) return NextResponse.next();

  // Same answer as a route that doesn't exist — no hint that it's gated
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export const config = {
  matcher: ['/admin/:path*', '/api/:path*', '/nfl'],
};
