// src/app/api/odds/route.ts
import { NextResponse } from 'next/server';
import { recordCreditSnapshot } from '@/lib/creditUsage';
import { ODDS_API_BOOKMAKERS } from '@/lib/api';

// Whitelist of sport keys we proxy to the Odds API. Anything else is rejected
// before it hits the paid API to prevent quota abuse via arbitrary sport keys.
const ALLOWED_SPORTS = new Set([
  'americanfootball_nfl',
  'americanfootball_ncaaf',
  'americanfootball_nfl_preseason',
  'americanfootball_cfl',
  'basketball_nba',
  'basketball_ncaab',
  'basketball_wnba',
  'baseball_mlb',
  'icehockey_nhl',
  'soccer_usa_mls',
  'soccer_epl',
  'lacrosse_ncaa',
]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sport = searchParams.get('sport');

  if (!sport) {
    return NextResponse.json([], { status: 200 });
  }

  if (!ALLOWED_SPORTS.has(sport)) {
    return NextResponse.json(
      { error: 'Invalid sport key' },
      { status: 400 }
    );
  }

  const apiKey = process.env.ODDS_API_KEY;

  try {
    // Explicit bookmaker list (not regions=us): Novig + ProphetX sit in the
    // "us_ex" exchange region, and a ≤10-book list bills as ONE region — same
    // 3 credits/call as before. includeLinks=true → deep links to betslips.
    const apiUrl = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${apiKey}&bookmakers=${ODDS_API_BOOKMAKERS.join(',')}&markets=h2h,spreads,totals&oddsFormat=american&includeLinks=true`;

    // Shared server-side cache: visitors within 60s reuse one paid API call
    const response = await fetch(apiUrl, { next: { revalidate: 60 } });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API error: ${response.status} - ${errorText}`);
      return NextResponse.json([], { status: 200 });
    }

    const data = await response.json();

    // Extract rate limit headers
    const requestsRemaining = response.headers.get('x-requests-remaining');
    const requestsUsed = response.headers.get('x-requests-used');
    console.log('Odds API rate limit — remaining:', requestsRemaining, 'used:', requestsUsed);

    // Fuel gauge: persist the counter (5-min throttle) so the Bet Admin
    // credits panel has history. Awaited — serverless may kill the lambda
    // after the response otherwise — but never throws.
    await recordCreditSnapshot(requestsRemaining, requestsUsed, 'odds-route');

    // Create a new response with the data and pass through the headers
    const nextResponse = NextResponse.json(data);
    
    // Add rate limit headers to our response
    if (requestsRemaining) nextResponse.headers.set('x-requests-remaining', requestsRemaining);
    if (requestsUsed) nextResponse.headers.set('x-requests-used', requestsUsed);
    
    return nextResponse;
  } catch (error) {
    console.error('Error fetching from odds API:', error);
    return NextResponse.json([], { status: 200 });
  }
}