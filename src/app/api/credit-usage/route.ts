// src/app/api/credit-usage/route.ts
// Fuel gauge for the Odds API key. GET returns the live counter (read via the
// FREE /v4/sports endpoint — verified x-requests-last: 0), records a snapshot,
// and serves bucketed history + burn stats for the Bet Admin panel.
//
// The counter is per-KEY and the key is shared with kalshi-mmbot, so burn
// shown here is TOTAL spend across the site and the bot.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { recordCreditSnapshot } from '@/lib/creditUsage';

export const dynamic = 'force-dynamic';

interface UsageRow {
  ts: string;
  remaining: number;
  used: number;
}

export async function GET() {
  const apiKey = process.env.ODDS_API_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!apiKey || !supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }

  // Live counter — free call, 0 credits.
  let remaining: number | null = null;
  let used: number | null = null;
  try {
    const res = await fetch(`https://api.the-odds-api.com/v4/sports?apiKey=${apiKey}`, {
      cache: 'no-store',
    });
    const rem = res.headers.get('x-requests-remaining');
    const usd = res.headers.get('x-requests-used');
    if (rem !== null) {
      remaining = parseInt(rem, 10);
      used = parseInt(usd ?? '0', 10);
      // Admin opens are rare — snapshot with a short throttle.
      await recordCreditSnapshot(rem, usd, 'admin', 60 * 1000);
    }
  } catch (e) {
    console.error('[credit-usage] live counter fetch failed:', e);
  }

  // History: last 30 days, paginated past PostgREST's 1000-row default.
  const supabase = createClient(supabaseUrl, supabaseKey);
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const rows: UsageRow[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabase
      .from('odds_api_usage')
      .select('ts, remaining, used')
      .gte('ts', since)
      .order('ts', { ascending: true })
      .range(from, from + 999);
    if (error || !data || data.length === 0) break;
    rows.push(...(data as UsageRow[]));
    if (data.length < 1000) break;
  }
  if (remaining !== null) {
    rows.push({ ts: new Date().toISOString(), remaining, used: used ?? 0 });
  }

  // Bucket to one point per hour (last snapshot wins) to keep the payload small.
  const byHour = new Map<string, UsageRow>();
  for (const r of rows) byHour.set(r.ts.slice(0, 13), r);
  const history = Array.from(byHour.values());

  // Burn over a window = used-counter delta vs the oldest snapshot inside it.
  // `used` (not `remaining`) so a mid-window plan reset doesn't go negative.
  // Returns the window's real span too — a 2-day-old table must not divide by 7.
  const windowBurn = (ms: number): { burn: number; days: number } | null => {
    const cutoff = Date.now() - ms;
    const base = history.find((r) => new Date(r.ts).getTime() >= cutoff);
    const last = history[history.length - 1];
    if (!base || !last || base === last) return null;
    const days = (new Date(last.ts).getTime() - new Date(base.ts).getTime()) / (24 * 3600 * 1000);
    return { burn: Math.max(0, last.used - base.used), days };
  };
  const w24 = windowBurn(24 * 3600 * 1000);
  const w7 = windowBurn(7 * 24 * 3600 * 1000);
  const burn24h = w24?.burn ?? null;
  const burn7d = w7?.burn ?? null;

  // Plan size falls straight out of the counters: remaining + used.
  const planSize = remaining !== null && used !== null ? remaining + used : null;
  const perDay = w7 && w7.days >= 0.25 ? w7.burn / w7.days : null;
  const daysLeft =
    remaining !== null && perDay !== null && perDay > 0 ? remaining / perDay : null;

  return NextResponse.json({ remaining, used, planSize, burn24h, burn7d, perDay, daysLeft, history });
}
