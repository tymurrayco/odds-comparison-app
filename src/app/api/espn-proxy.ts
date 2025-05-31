// src/app/api/espn-proxy/route.ts
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  // Get the URL from the query parameter
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  
  if (!url) {
    return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
  }
  
  try {
    // Fetch data from ESPN API
    const response = await fetch(url);
    
    if (!response.ok) {
      return NextResponse.json(
        { error: `Error fetching from ESPN API: ${response.status}` }, 
        { status: response.status }
      );
    }
    
    // Parse and return the data
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching from ESPN API:', error);
    return NextResponse.json(
      { error: 'Error fetching from ESPN API' }, 
      { status: 500 }
    );
  }
}