// src/lib/adminAuth.ts
//
// The admin "wristband": a long-lived httpOnly cookie issued by
// POST /api/admin/login when the submitted password equals ADMIN_SECRET.
// The cookie holds a SHA-256 derivative of the secret (never the secret
// itself), so a leaked cookie can't be turned back into the password.
//
// Edge-safe (Web Crypto only) because src/middleware.ts checks it on every
// /admin page and every write / credit-burning API request.

export const ADMIN_COOKIE = 'oddsday_admin';
export const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The cookie value that proves possession of ADMIN_SECRET. */
export async function adminToken(secret: string): Promise<string> {
  return sha256Hex(`oddsday-admin-v1:${secret}`);
}

/** Constant-time string equality (no early exit on the first differing char). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function cookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

/**
 * True when the request carries a valid admin cookie. Works for route
 * handlers (Request) and middleware (NextRequest) alike — only the Cookie
 * header is read. With ADMIN_SECRET unset nothing can be admin.
 */
export async function isAdminRequest(request: { headers: Headers }): Promise<boolean> {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  const presented = cookieValue(request.headers.get('cookie'), ADMIN_COOKIE);
  if (!presented) return false;
  return safeEqual(presented, await adminToken(secret));
}
