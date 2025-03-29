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
    const apiUrl = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;
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
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching from odds API:', error);
    return NextResponse.json([], { status: 200 });
  }
}