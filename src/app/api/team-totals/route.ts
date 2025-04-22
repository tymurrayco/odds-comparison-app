// src/app/api/team-totals/route.ts
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sport = searchParams.get('sport');
  const eventId = searchParams.get('eventId');
  
  if (!sport || !eventId) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  const apiKey = process.env.ODDS_API_KEY;
  
  try {
    const apiUrl = `https://api.the-odds-api.com/v4/sports/${sport}/events/${eventId}/odds?apiKey=${apiKey}&regions=us&markets=team_totals&oddsFormat=american`;
    
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      return NextResponse.json({ error: 'API error' }, { status: 500 });
    }
    
    const data = await response.json();
    
    // Pass through rate limit headers
    const nextResponse = NextResponse.json(data);
    const requestsRemaining = response.headers.get('x-requests-remaining');
    if (requestsRemaining) nextResponse.headers.set('x-requests-remaining', requestsRemaining);
    
    return nextResponse;
  } catch (error) {
    console.error('Error fetching team totals:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}