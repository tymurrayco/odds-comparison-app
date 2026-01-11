// src/app/api/odds/route.ts
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  console.log('API route called');
  console.log('API Key available:', !!process.env.ODDS_API_KEY);
  
  const { searchParams } = new URL(request.url);
  const sport = searchParams.get('sport');
  
  console.log('Sport requested:', sport);
  
  if (!sport) {
    return NextResponse.json([], { status: 200 });
  }

  const apiKey = process.env.ODDS_API_KEY;
  
  try {
    // Added includeLinks=true to get deep links to sportsbook betslips
    const apiUrl = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american&includeLinks=true`;
    console.log('Requesting URL:', apiUrl.replace(apiKey as string, '[REDACTED]'));
    
    const response = await fetch(apiUrl);
    console.log('Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API error: ${response.status} - ${errorText}`);
      return NextResponse.json([], { status: 200 });
    }
    
    const data = await response.json();
    console.log('Data received, count:', Array.isArray(data) ? data.length : 'Not an array');
    
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
    console.error('Error fetching from odds API:', error);
    return NextResponse.json([], { status: 200 });
  }
}