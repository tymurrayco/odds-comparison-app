// src/app/api/props/route.ts
import { NextResponse } from 'next/server';

// Player prop markets by sport
const PROP_MARKETS: { [key: string]: string[] } = {
  // NBA player props
  'basketball_nba': [
    'player_points',
    'player_rebounds', 
    'player_assists',
    'player_threes',
    'player_points_rebounds_assists',
    'player_points_rebounds',
    'player_points_assists',
    'player_rebounds_assists',
    'player_steals',
    'player_blocks',
    'player_turnovers',
    'player_double_double',
    'player_triple_double'
  ],
  // NFL player props
  'americanfootball_nfl': [
    'player_pass_tds',
    'player_pass_yds',
    'player_pass_completions',
    'player_pass_attempts',
    'player_pass_interceptions',
    'player_rush_yds',
    'player_rush_attempts',
    'player_rush_longest',
    'player_receptions',
    'player_reception_yds',
    'player_reception_longest',
    'player_kicking_points',
    'player_field_goals',
    'player_tackles_assists',
    'player_anytime_td'
  ],
  // NCAAF player props
  'americanfootball_ncaaf': [
    'player_pass_tds',
    'player_pass_yds',
    'player_rush_yds',
    'player_receptions',
    'player_reception_yds',
    'player_anytime_td'
  ],
  // NHL player props
  'icehockey_nhl': [
    'player_points',
    'player_power_play_points',
    'player_assists',
    'player_blocked_shots',
    'player_shots_on_goal',
    'player_goals',
    'player_total_saves'
  ],
  // MLB player props
  'baseball_mlb': [
    'batter_home_runs',
    'batter_hits',
    'batter_total_bases',
    'batter_rbis',
    'batter_runs_scored',
    'batter_hits_runs_rbis',
    'batter_singles',
    'batter_doubles',
    'batter_triples',
    'batter_walks',
    'batter_strikeouts',
    'batter_stolen_bases',
    'pitcher_strikeouts',
    'pitcher_hits_allowed',
    'pitcher_walks',
    'pitcher_earned_runs',
    'pitcher_outs'
  ],
  // NCAAB player props
  'basketball_ncaab': [
    'player_points',
    'player_rebounds',
    'player_assists',
    'player_threes',
    'player_points_rebounds_assists'
  ]
};

export async function GET(request: Request) {
  console.log('Props API route called');
  
  const { searchParams } = new URL(request.url);
  const sport = searchParams.get('sport');
  const eventId = searchParams.get('eventId');
  
  if (!sport) {
    return NextResponse.json({ error: 'Missing sport parameter' }, { status: 400 });
  }

  const apiKey = process.env.ODDS_API_KEY;
  
  // If eventId is provided, fetch props for that specific event
  if (eventId) {
    const markets = PROP_MARKETS[sport];
    if (!markets || markets.length === 0) {
      return NextResponse.json({ error: 'No prop markets available for this sport' }, { status: 400 });
    }
    
    try {
      const marketsParam = markets.join(',');
      const apiUrl = `https://api.the-odds-api.com/v4/sports/${sport}/events/${eventId}/odds?apiKey=${apiKey}&regions=us&markets=${marketsParam}&oddsFormat=american`;
      console.log('Requesting props URL:', apiUrl.replace(apiKey || '', '[REDACTED]'));
      
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API error: ${response.status} - ${errorText}`);
        return NextResponse.json({ error: 'API error', details: errorText }, { status: response.status });
      }
      
      const data = await response.json();
      
      // Extract rate limit headers
      const requestsRemaining = response.headers.get('x-requests-remaining');
      const requestsUsed = response.headers.get('x-requests-used');
      console.log('API Rate Limit - Remaining:', requestsRemaining, 'Used:', requestsUsed);
      
      const nextResponse = NextResponse.json(data);
      if (requestsRemaining) nextResponse.headers.set('x-requests-remaining', requestsRemaining);
      if (requestsUsed) nextResponse.headers.set('x-requests-used', requestsUsed);
      
      return nextResponse;
    } catch (error) {
      console.error('Error fetching props:', error);
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
  }
  
  // If no eventId, return the list of available events for props
  try {
    const apiUrl = `https://api.the-odds-api.com/v4/sports/${sport}/events?apiKey=${apiKey}`;
    console.log('Requesting events URL:', apiUrl.replace(apiKey || '', '[REDACTED]'));
    
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API error: ${response.status} - ${errorText}`);
      return NextResponse.json({ error: 'API error', details: errorText }, { status: response.status });
    }
    
    const data = await response.json();
    
    const requestsRemaining = response.headers.get('x-requests-remaining');
    const requestsUsed = response.headers.get('x-requests-used');
    console.log('API Rate Limit - Remaining:', requestsRemaining, 'Used:', requestsUsed);
    
    const nextResponse = NextResponse.json(data);
    if (requestsRemaining) nextResponse.headers.set('x-requests-remaining', requestsRemaining);
    if (requestsUsed) nextResponse.headers.set('x-requests-used', requestsUsed);
    
    return nextResponse;
  } catch (error) {
    console.error('Error fetching events:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}