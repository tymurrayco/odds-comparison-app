// src/app/api/ratings/historical-odds/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { OddsAPIGame, HistoricalOddsResponse, ClosingLineSource } from '@/lib/ratings/types';
import { 
  ODDS_API_BASE_URL, 
  NCAAB_SPORT_KEY, 
  US_AVERAGE_BOOKMAKER_KEYS,
  DEFAULT_RATINGS_CONFIG,
} from '@/lib/ratings/constants';

/**
 * Historical Odds API Route
 * 
 * Fetches historical odds snapshots from The Odds API to get closing lines.
 * 
 * Query parameters:
 * - date: string (ISO timestamp of when to get odds, e.g., game start - 5 min)
 * - source: 'pinnacle' | 'us_average' (default: from config)
 * - eventIds: comma-separated list of event IDs to filter (optional)
 */

export async function GET(request: NextRequest) {
  const apiKey = process.env.ODDS_API_KEY;
  
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Odds API key not configured' },
      { status: 500 }
    );
  }
  
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const source = (searchParams.get('source') || DEFAULT_RATINGS_CONFIG.closingSource) as ClosingLineSource;
  const eventIds = searchParams.get('eventIds');
  
  if (!date) {
    return NextResponse.json(
      { error: 'Date parameter is required (ISO 8601 format)' },
      { status: 400 }
    );
  }
  
  try {
    // Determine regions and bookmakers based on source
    let regions: string;
    let bookmakers: string | undefined;
    
    if (source === 'pinnacle') {
      regions = 'eu';
      bookmakers = 'pinnacle';
    } else {
      regions = 'us';
      bookmakers = US_AVERAGE_BOOKMAKER_KEYS.join(',');
    }
    
    // Build API URL
    const params = new URLSearchParams({
      apiKey,
      regions,
      markets: 'spreads',
      oddsFormat: 'american',
      date,
    });
    
    if (bookmakers) {
      params.set('bookmakers', bookmakers);
    }
    
    if (eventIds) {
      params.set('eventIds', eventIds);
    }
    
    const url = `${ODDS_API_BASE_URL}/historical/sports/${NCAAB_SPORT_KEY}/odds?${params.toString()}`;
    
    console.log(`[Historical Odds] Fetching for date: ${date}, source: ${source}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Historical Odds] Error ${response.status}:`, errorText);
      return NextResponse.json(
        { error: `Odds API error: ${response.status}` },
        { status: response.status }
      );
    }
    
    const data: HistoricalOddsResponse = await response.json();
    
    // Extract rate limit headers
    const requestsRemaining = response.headers.get('x-requests-remaining');
    const requestsUsed = response.headers.get('x-requests-used');
    
    console.log(`[Historical Odds] Success: ${data.data?.length || 0} games, timestamp: ${data.timestamp}`);
    console.log(`[Historical Odds] Rate limit - Remaining: ${requestsRemaining}, Used: ${requestsUsed}`);
    
    return NextResponse.json({
      success: true,
      source,
      snapshotTimestamp: data.timestamp,
      previousTimestamp: data.previous_timestamp,
      nextTimestamp: data.next_timestamp,
      gamesCount: data.data?.length || 0,
      games: data.data || [],
      rateLimit: {
        remaining: requestsRemaining,
        used: requestsUsed,
      },
    });
    
  } catch (error) {
    console.error('[Historical Odds] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch historical odds' },
      { status: 500 }
    );
  }
}

/**
 * POST endpoint for batch fetching multiple dates
 * 
 * Body:
 * {
 *   dates: string[] - Array of ISO timestamps
 *   source: 'pinnacle' | 'us_average'
 * }
 */
export async function POST(request: NextRequest) {
  const apiKey = process.env.ODDS_API_KEY;
  
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Odds API key not configured' },
      { status: 500 }
    );
  }
  
  try {
    const body = await request.json();
    const { dates, source = DEFAULT_RATINGS_CONFIG.closingSource } = body;
    
    if (!dates || !Array.isArray(dates) || dates.length === 0) {
      return NextResponse.json(
        { error: 'dates array is required' },
        { status: 400 }
      );
    }
    
    // Limit batch size to prevent excessive API usage
    const MAX_BATCH_SIZE = 10;
    if (dates.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Maximum batch size is ${MAX_BATCH_SIZE} dates` },
        { status: 400 }
      );
    }
    
    // Determine regions and bookmakers based on source
    let regions: string;
    let bookmakers: string | undefined;
    
    if (source === 'pinnacle') {
      regions = 'eu';
      bookmakers = 'pinnacle';
    } else {
      regions = 'us';
      bookmakers = US_AVERAGE_BOOKMAKER_KEYS.join(',');
    }
    
    const results: Array<{
      date: string;
      snapshotTimestamp: string;
      games: OddsAPIGame[];
    }> = [];
    
    for (const date of dates) {
      const params = new URLSearchParams({
        apiKey,
        regions,
        markets: 'spreads',
        oddsFormat: 'american',
        date,
      });
      
      if (bookmakers) {
        params.set('bookmakers', bookmakers);
      }
      
      const url = `${ODDS_API_BASE_URL}/historical/sports/${NCAAB_SPORT_KEY}/odds?${params.toString()}`;
      
      const response = await fetch(url);
      
      if (response.ok) {
        const data: HistoricalOddsResponse = await response.json();
        results.push({
          date,
          snapshotTimestamp: data.timestamp,
          games: data.data || [],
        });
      } else {
        console.warn(`[Historical Odds Batch] Failed for date ${date}: ${response.status}`);
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return NextResponse.json({
      success: true,
      source,
      requestedDates: dates.length,
      successfulDates: results.length,
      results,
    });
    
  } catch (error) {
    console.error('[Historical Odds Batch] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch historical odds batch' },
      { status: 500 }
    );
  }
}
