// src/app/api/ratings/backfill-opening/route.ts

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ODDS_API_BASE_URL, NCAAB_SPORT_KEY } from '@/lib/ratings/constants';

// Force dynamic rendering
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Backfill Opening Spreads API Route
 * 
 * Fetches opening spreads for games in ncaab_game_adjustments that don't have them.
 * Uses the historical Odds API to get odds from 24-48h before game time.
 * Uses team overrides for proper name matching.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface OddsOutcome {
  name: string;
  price: number;
  point?: number;
}

interface OddsMarket {
  key: string;
  last_update: string;
  outcomes: OddsOutcome[];
}

interface OddsBookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: OddsMarket[];
}

interface OddsGame {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsBookmaker[];
}

interface TeamOverride {
  source_name: string;
  kenpom_name: string;
  odds_api_name: string | null;
}

// Extract spread from bookmakers (Pinnacle first, then US average)
function extractSpread(game: OddsGame): number | null {
  // Try Pinnacle first
  const pinnacle = game.bookmakers.find(b => b.key === 'pinnacle');
  if (pinnacle) {
    const spreadsMarket = pinnacle.markets.find(m => m.key === 'spreads');
    if (spreadsMarket) {
      const homeOutcome = spreadsMarket.outcomes.find(o => o.name === game.home_team);
      if (homeOutcome?.point !== undefined) {
        return homeOutcome.point;
      }
    }
  }
  
  // Fall back to US books average
  const usBooks = ['draftkings', 'fanduel', 'betmgm', 'betrivers'];
  const spreads: number[] = [];
  
  for (const bookKey of usBooks) {
    const bookmaker = game.bookmakers.find(b => b.key === bookKey);
    if (bookmaker) {
      const spreadsMarket = bookmaker.markets.find(m => m.key === 'spreads');
      if (spreadsMarket) {
        const homeOutcome = spreadsMarket.outcomes.find(o => o.name === game.home_team);
        if (homeOutcome?.point !== undefined) {
          spreads.push(homeOutcome.point);
        }
      }
    }
  }
  
  if (spreads.length > 0) {
    const avg = spreads.reduce((a, b) => a + b, 0) / spreads.length;
    return Math.round(avg * 2) / 2;
  }
  
  return null;
}

export async function POST(request: Request) {
  const apiKey = process.env.ODDS_API_KEY;
  
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Odds API key not configured' },
      { status: 500 }
    );
  }
  
  // Parse optional date range from query params
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('start');
  const endDate = searchParams.get('end');
  
  try {
    // Load team overrides for name matching
    const { data: overridesData } = await supabase
      .from('ncaab_team_overrides')
      .select('source_name, kenpom_name, odds_api_name');
    
    const overrides: TeamOverride[] = overridesData || [];
    
    // Build lookup maps
    // kenpomName -> oddsApiName (for matching our DB names to Odds API names)
    const kenpomToOddsApi = new Map<string, string>();
    // oddsApiName -> kenpomName (reverse lookup)
    const oddsApiToKenpom = new Map<string, string>();
    
    for (const o of overrides) {
      if (o.odds_api_name) {
        kenpomToOddsApi.set(o.kenpom_name.toLowerCase(), o.odds_api_name.toLowerCase());
        oddsApiToKenpom.set(o.odds_api_name.toLowerCase(), o.kenpom_name.toLowerCase());
      }
      // Also map source_name (ESPN name) to odds_api_name
      if (o.odds_api_name) {
        kenpomToOddsApi.set(o.source_name.toLowerCase(), o.odds_api_name.toLowerCase());
      }
    }
    
    console.log(`[BackfillOpening] Loaded ${overrides.length} team overrides`);
    
    // Build query for games without opening spreads
    let query = supabase
      .from('ncaab_game_adjustments')
      .select('game_id, game_date, home_team, away_team')
      .is('opening_spread', null)
      .order('game_date', { ascending: true })
      .limit(50);
    
    // Apply date filters if provided
    if (startDate) {
      query = query.gte('game_date', `${startDate}T00:00:00Z`);
    }
    if (endDate) {
      query = query.lte('game_date', `${endDate}T23:59:59Z`);
    }
    
    const { data: games, error } = await query;
    
    if (error) {
      console.error('[BackfillOpening] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to fetch games' }, { status: 500 });
    }
    
    if (!games || games.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No games need opening spreads',
        processed: 0,
        updated: 0,
        notFound: 0,
        apiCalls: 0,
      });
    }
    
    console.log(`[BackfillOpening] Processing ${games.length} games`);
    
    const results = {
      processed: 0,
      updated: 0,
      notFound: 0,
      errors: [] as string[],
      apiCalls: 0,
    };
    
    // Cache for API responses by timestamp
    const oddsCache = new Map<string, OddsGame[]>();
    
    // Helper function to find matching game using overrides
    const findMatchingGame = (
      kenpomHome: string, 
      kenpomAway: string, 
      oddsGames: OddsGame[]
    ): OddsGame | undefined => {
      const homeLower = kenpomHome.toLowerCase();
      const awayLower = kenpomAway.toLowerCase();
      
      // Get expected Odds API names from overrides
      const expectedHomeOddsApi = kenpomToOddsApi.get(homeLower);
      const expectedAwayOddsApi = kenpomToOddsApi.get(awayLower);
      
      for (const og of oddsGames) {
        const ogHomeLower = og.home_team.toLowerCase();
        const ogAwayLower = og.away_team.toLowerCase();
        
        let homeMatch = false;
        let awayMatch = false;
        
        // Check home team match
        if (expectedHomeOddsApi && ogHomeLower === expectedHomeOddsApi) {
          homeMatch = true;
        } else if (ogHomeLower.includes(homeLower) || homeLower.includes(ogHomeLower)) {
          homeMatch = true;
        } else if (ogHomeLower.startsWith(homeLower + ' ')) {
          homeMatch = true;
        }
        
        // Check away team match  
        if (expectedAwayOddsApi && ogAwayLower === expectedAwayOddsApi) {
          awayMatch = true;
        } else if (ogAwayLower.includes(awayLower) || awayLower.includes(ogAwayLower)) {
          awayMatch = true;
        } else if (ogAwayLower.startsWith(awayLower + ' ')) {
          awayMatch = true;
        }
        
        if (homeMatch && awayMatch) {
          return og;
        }
      }
      
      return undefined;
    };
    
    for (const game of games) {
      const gameStart = new Date(game.game_date);
      
      // Try lookback periods: 48h, 36h, 24h, 12h
      const lookbackHours = [48, 36, 24, 12];
      let openingSpread: number | null = null;
      
      for (const hours of lookbackHours) {
        if (openingSpread !== null) break;
        
        const lookbackTime = new Date(gameStart.getTime() - hours * 60 * 60 * 1000);
        const cacheKey = lookbackTime.toISOString().slice(0, 13); // Cache by hour
        
        let oddsGames = oddsCache.get(cacheKey);
        
        if (!oddsGames) {
          // Fetch from API
          const dateStr = lookbackTime.toISOString().replace(/\.\d{3}Z$/, 'Z');
          
          try {
            const params = new URLSearchParams({
              apiKey,
              regions: 'us,eu',
              markets: 'spreads',
              oddsFormat: 'american',
              date: dateStr,
            });
            
            const url = `${ODDS_API_BASE_URL}/historical/sports/${NCAAB_SPORT_KEY}/odds?${params.toString()}`;
            const response = await fetch(url);
            results.apiCalls++;
            
            if (response.ok) {
              const data = await response.json();
              oddsGames = data.data || [];
              oddsCache.set(cacheKey, oddsGames);
            } else {
              console.warn(`[BackfillOpening] API error for ${dateStr}: ${response.status}`);
              continue;
            }
          } catch (err) {
            console.warn(`[BackfillOpening] Fetch error:`, err);
            continue;
          }
        }
        
        if (oddsGames && oddsGames.length > 0) {
          // Find matching game using overrides
          const matchingGame = findMatchingGame(game.home_team, game.away_team, oddsGames);
          
          if (matchingGame) {
            openingSpread = extractSpread(matchingGame);
            if (openingSpread !== null) {
              console.log(`[BackfillOpening] Found opening for ${game.away_team} @ ${game.home_team} at ${hours}h: ${openingSpread}`);
            }
          }
        }
      }
      
      results.processed++;
      
      if (openingSpread !== null) {
        // Update the record
        const { error: updateError } = await supabase
          .from('ncaab_game_adjustments')
          .update({ opening_spread: openingSpread })
          .eq('game_id', game.game_id);
        
        if (updateError) {
          results.errors.push(`Failed to update ${game.game_id}: ${updateError.message}`);
        } else {
          results.updated++;
        }
      } else {
        results.notFound++;
        console.log(`[BackfillOpening] No opening found for ${game.away_team} @ ${game.home_team}`);
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    console.log(`[BackfillOpening] Complete:`, results);
    
    return NextResponse.json({
      success: true,
      ...results,
      remainingGames: games.length - results.processed,
    });
    
  } catch (error) {
    console.error('[BackfillOpening] Error:', error);
    return NextResponse.json(
      { error: 'Backfill failed' },
      { status: 500 }
    );
  }
}

// GET to check status
export async function GET() {
  try {
    const { data: withOpening, error: e1 } = await supabase
      .from('ncaab_game_adjustments')
      .select('game_id', { count: 'exact' })
      .not('opening_spread', 'is', null);
    
    const { data: withoutOpening, error: e2 } = await supabase
      .from('ncaab_game_adjustments')
      .select('game_id', { count: 'exact' })
      .is('opening_spread', null);
    
    return NextResponse.json({
      withOpeningSpread: withOpening?.length || 0,
      withoutOpeningSpread: withoutOpening?.length || 0,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to get status' }, { status: 500 });
  }
}
