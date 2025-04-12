// src/app/api/futures/route.ts
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  console.log('Futures API route called');
  
  const { searchParams } = new URL(request.url);
  const sport = searchParams.get('sport');
  
  if (!sport) {
    return NextResponse.json([], { status: 200 });
  }

  // Map sport keys to their championship endpoint
  // Add the index signature to fix TypeScript error
  const sportToChampionship: { [key: string]: string } = {
    'basketball_nba': 'basketball_nba_championship_winner',
    'americanfootball_nfl': 'americanfootball_nfl_super_bowl_winner',
    'baseball_mlb': 'baseball_mlb_world_series_winner',
    'icehockey_nhl': 'icehockey_nhl_championship_winner',
    'basketball_ncaab': 'basketball_ncaab_championship_winner',
    'americanfootball_ncaaf': 'americanfootball_ncaaf_championship_winner',
    'soccer_epl': 'soccer_epl_winner',
    'golf_masters_tournament_winner': 'golf_masters_tournament_winner' // Masters tournament
  };

  const championshipKey = sportToChampionship[sport];
  if (!championshipKey) {
    return NextResponse.json([], { status: 200 });
  }
  
  try {
    const apiUrl = `https://api.the-odds-api.com/v4/sports/${championshipKey}/odds/?apiKey=${process.env.ODDS_API_KEY}&regions=us&markets=outrights&oddsFormat=american`;
    console.log('Requesting futures URL:', apiUrl.replace(process.env.ODDS_API_KEY || '', '[REDACTED]'));
    
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
    console.log('API Rate Limit - Remaining:', requestsRemaining, 'Used:', requestsUsed);
    
    // Create a new response with the data and pass through the headers
    const nextResponse = NextResponse.json(data);
    
    // Add rate limit headers to our response
    if (requestsRemaining) nextResponse.headers.set('x-requests-remaining', requestsRemaining);
    if (requestsUsed) nextResponse.headers.set('x-requests-used', requestsUsed);
    
    return nextResponse;
  } catch (error) {
    console.error('Error fetching futures:', error);
    return NextResponse.json([], { status: 200 });
  }
}