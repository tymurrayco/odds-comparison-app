// src/app/go/[book]/route.ts
//
// Sportsbook click-out: /go/draftkings?to=<deep link>&sport=...&game=...&market=...&outcome=...
// Every book price on the board links here (src/lib/books.ts goUrl()). The
// handler resolves the book, validates `to` against the book's domain
// allowlist (https only — anything else is ignored and the click lands on the
// book's affiliate/home page), 302s, and logs the click to book_clicks after
// the response is sent so logging can never slow or break the redirect.

import { NextRequest, NextResponse, after } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { bookBySlug, hostAllowed, type BookConfig } from '@/lib/books';

export const dynamic = 'force-dynamic';

const LOG_TIMEOUT_MS = 1500;

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/** The `to` param as a URL if it's https and points at one of the book's domains, else null. */
function allowedDeepLink(to: string | null, book: BookConfig): URL | null {
  if (!to) return null;
  let url: URL;
  try {
    url = new URL(to);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (!hostAllowed(url.hostname, book.domains)) return null;
  return url;
}

function deviceFromUa(ua: string): 'mobile' | 'tablet' | 'desktop' {
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|iPod|Android|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return 'mobile';
  return 'desktop';
}

function clip(s: string | null, max: number): string | null {
  return s ? s.slice(0, max) : null;
}

function resolveDestination(req: NextRequest, book: BookConfig): { url: string; deepLink: boolean } {
  const to = allowedDeepLink(req.nextUrl.searchParams.get('to'), book);
  if (to) {
    for (const [k, v] of Object.entries(book.affiliateParams)) to.searchParams.set(k, v);
    return { url: to.toString(), deepLink: true };
  }
  return { url: book.affiliateUrl ?? book.homeUrl, deepLink: false };
}

function redirectTo(url: string): NextResponse {
  const res = NextResponse.redirect(url, 302);
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

async function logClick(req: NextRequest, book: BookConfig, destination: string, deepLink: boolean): Promise<void> {
  try {
    const q = req.nextUrl.searchParams;
    const row = {
      book: book.slug,
      sport: q.get('sport') || null,
      game_id: q.get('game') || null,
      market: q.get('market') || null,
      outcome: clip(q.get('outcome'), 200),
      deep_link: deepLink,
      destination_host: new URL(destination).hostname,
      state: req.headers.get('x-vercel-ip-country-region'),
      country: req.headers.get('x-vercel-ip-country'),
      device: deviceFromUa(req.headers.get('user-agent') ?? ''),
      referrer: clip(req.headers.get('referer'), 500),
      user_agent: clip(req.headers.get('user-agent'), 300),
    };
    const insert = sb().from('book_clicks').insert(row).then(({ error }) => {
      if (error) console.error('[go] book_clicks insert failed:', error.message);
    });
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, LOG_TIMEOUT_MS));
    await Promise.race([insert, timeout]);
  } catch (err) {
    console.error('[go] click log failed:', err);
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ book: string }> }) {
  const { book: slug } = await params;
  const book = bookBySlug(slug);
  if (!book) return NextResponse.json({ error: `Unknown book: ${slug}` }, { status: 404 });

  const { url, deepLink } = resolveDestination(req, book);

  // after() runs once the response has been sent; if this Next build can't
  // schedule it (older runtime), fall back to a bounded await so the redirect
  // still goes out within LOG_TIMEOUT_MS.
  try {
    after(() => logClick(req, book, url, deepLink));
  } catch {
    await logClick(req, book, url, deepLink);
  }

  return redirectTo(url);
}

// Beacon logging (navigator.sendBeacon / fetch keepalive) for clicks that must
// NOT go through the redirect — app-link books on phones, where iOS only opens
// the app from a direct tap on the universal link. Same params as GET; 204.
export async function POST(req: NextRequest, { params }: { params: Promise<{ book: string }> }) {
  const { book: slug } = await params;
  const book = bookBySlug(slug);
  if (!book) return new NextResponse(null, { status: 404 });
  const { url, deepLink } = resolveDestination(req, book);
  await logClick(req, book, url, deepLink);
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

// Link previewers / health checks: same redirect, no click logged.
export async function HEAD(req: NextRequest, { params }: { params: Promise<{ book: string }> }) {
  const { book: slug } = await params;
  const book = bookBySlug(slug);
  if (!book) return new NextResponse(null, { status: 404 });
  return redirectTo(resolveDestination(req, book).url);
}
