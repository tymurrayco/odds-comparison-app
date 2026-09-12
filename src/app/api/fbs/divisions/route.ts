// src/app/api/fbs/divisions/route.ts

/**
 * GET /api/fbs/divisions
 * ESPN display names of every FBS- and FCS-rated team (from the Ledger
 * ratings tables), so bet lists can split NCAAF records into FBS, FBS vs
 * FCS and FCS games. Cached in-process for an hour — membership only
 * changes at a re-seed.
 */

import { NextResponse } from 'next/server';
import { loadFbsRatings } from '@/lib/fbs/supabase';
import { loadFcsRatings } from '@/lib/fcs/supabase';

export const dynamic = 'force-dynamic';

let cache: { at: number; fbs: string[]; fcs: string[] } | null = null;
const TTL_MS = 60 * 60 * 1000;

export async function GET() {
  try {
    if (!cache || Date.now() - cache.at > TTL_MS) {
      const [fbs, fcs] = await Promise.all([loadFbsRatings(), loadFcsRatings()]);
      cache = {
        at: Date.now(),
        fbs: [...fbs.values()].map((r) => r.espnName).filter((n): n is string => !!n),
        fcs: [...fcs.values()].map((r) => r.espnName).filter((n): n is string => !!n),
      };
    }
    return NextResponse.json(
      { success: true, fbs: cache.fbs, fcs: cache.fcs },
      { headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' } }
    );
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
