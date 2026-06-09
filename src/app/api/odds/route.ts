// src/app/api/odds/route.ts
import { NextResponse } from 'next/server';

// Whitelist of sport keys we proxy to the Odds API. Anything else is rejected
// before it hits the paid API to prevent quota abuse via arbitrary sport keys.
const ALLOWED_SPORTS = new Set([
  'americanfootball_nfl',
  'americanfootball_ncaaf',
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
    // Added includeLinks=true to get deep links to sportsbook betslips
    const apiUrl = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american&includeLinks=true`;

    const response = await fetch(apiUrl);

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