// src/app/api/ratings/kenpom/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { KENPOM_API_BASE_URL } from '@/lib/ratings/constants';

/**
 * KenPom API Route
 * 
 * Fetches ratings data from the KenPom API.
 * 
 * Query parameters:
 * - type: 'current' | 'archive' | 'teams' (default: 'current')
 * - season: number (e.g., 2025 for 2024-25 season)
 * - date: string (ISO date, only for archive type)
 * - preseason: boolean (only for archive type)
 */

export async function GET(request: NextRequest) {
  const apiKey = process.env.KENPOM_API_KEY;
  
  if (!apiKey) {
    return NextResponse.json(
      { error: 'KenPom API key not configured' },
      { status: 500 }
    );
  }
  
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'current';
  const season = searchParams.get('season');
  const date = searchParams.get('date');
  const preseason = searchParams.get('preseason') === 'true';
  
  try {
    let endpoint: string;
    let params: URLSearchParams;
    
    switch (type) {
      case 'archive':
        endpoint = 'archive';
        params = new URLSearchParams();
        
        if (preseason && season) {
          params.set('preseason', 'true');
          params.set('y', season);
        } else if (date) {
          params.set('d', date);
        } else {
          return NextResponse.json(
            { error: 'Archive requires either date or preseason+season parameters' },
            { status: 400 }
          );
        }
        break;
        
      case 'teams':
        endpoint = 'teams';
        params = new URLSearchParams();
        if (season) {
          params.set('y', season);
        } else {
          return NextResponse.json(
            { error: 'Teams endpoint requires season parameter' },
            { status: 400 }
          );
        }
        break;
        
      case 'current':
      default:
        endpoint = 'ratings';
        params = new URLSearchParams();
        if (season) {
          params.set('y', season);
        }
        break;
    }
    
    const url = `${KENPOM_API_BASE_URL}?endpoint=${endpoint}&${params.toString()}`;
    
    console.log(`[KenPom API] Fetching: ${endpoint} with params:`, Object.fromEntries(params));
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      // Cache for 1 hour for current ratings, longer for archive
      next: { revalidate: type === 'archive' ? 86400 : 3600 },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[KenPom API] Error ${response.status}:`, errorText);
      return NextResponse.json(
        { error: `KenPom API error: ${response.status}` },
        { status: response.status }
      );
    }
    
    const data = await response.json();
    
    // Log success
    const count = Array.isArray(data) ? data.length : 1;
    console.log(`[KenPom API] Success: ${count} records returned`);
    
    return NextResponse.json({
      success: true,
      type,
      season: season ? parseInt(season) : null,
      data,
    });
    
  } catch (error) {
    console.error('[KenPom API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch KenPom data' },
      { status: 500 }
    );
  }
}
