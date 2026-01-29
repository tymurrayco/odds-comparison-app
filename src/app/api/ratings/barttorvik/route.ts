// src/app/api/ratings/barttorvik/route.ts
// Uses Puppeteer to scrape barttorvik.com (bypasses bot protection)

import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';
import { saveTorvikTeams, saveBTSchedule } from '@/lib/ratings/supabase';

interface BTGame {
  date: string;
  time: string;
  away_team: string;
  home_team: string;
  away_rank?: number;
  home_rank?: number;
  spread?: number;
  total?: number;
  status: 'scheduled' | 'in_progress' | 'final';
  venue?: string;
  neutral?: boolean;
  predicted_spread?: number;
  predicted_total?: number;
  away_win_prob?: number;
  home_win_prob?: number;
}

interface BTRating {
  rank: number;
  team: string;
  conf: string;
  record: string;
  adj_o: number;
  adj_d: number;
  adj_t: number;
  barthag: number;
}

// Simple in-memory cache
let ratingsCache: { data: BTRating[]; timestamp: number } | null = null;
let scheduleCache: { data: BTGame[]; timestamp: number } | null = null;
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'ratings';
  const forceRefresh = searchParams.get('refresh') === 'true';
  const syncTeams = searchParams.get('syncTeams') === 'true';

  try {
    if (type === 'ratings') {
      if (!forceRefresh && !syncTeams && ratingsCache && Date.now() - ratingsCache.timestamp < CACHE_DURATION) {
        return NextResponse.json({
          success: true,
          data: ratingsCache.data,
          cached: true,
        });
      }

      const ratings = await fetchRatings();
      ratingsCache = { data: ratings, timestamp: Date.now() };

      // If syncTeams requested, save team names to Supabase
      let teamsSynced = 0;
      if (syncTeams && ratings.length > 0) {
        const teams = ratings.map(r => ({ name: r.team, conference: r.conf }));
        await saveTorvikTeams(teams);
        teamsSynced = teams.length;
      }

      return NextResponse.json({
        success: true,
        data: ratings,
        cached: false,
        count: ratings.length,
        teamsSynced: syncTeams ? teamsSynced : undefined,
      });
    } else if (type === 'schedule') {
      if (!forceRefresh && scheduleCache && Date.now() - scheduleCache.timestamp < CACHE_DURATION) {
        return NextResponse.json({
          success: true,
          data: scheduleCache.data,
          cached: true,
        });
      }

      const games = await fetchSchedule();
      scheduleCache = { data: games, timestamp: Date.now() };

      // Save to Supabase for persistence
      if (games.length > 0) {
        const btGames = games.map(g => ({
          gameDate: g.date,
          gameTime: g.time,
          awayTeam: g.away_team,
          homeTeam: g.home_team,
          predictedSpread: g.predicted_spread,
          predictedTotal: g.predicted_total,
          awayWinProb: g.away_win_prob,
          homeWinProb: g.home_win_prob,
        }));
        await saveBTSchedule(btGames);
      }

      return NextResponse.json({
        success: true,
        data: games,
        cached: false,
        count: games.length,
      });
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid type. Use: ratings or schedule',
    }, { status: 400 });

  } catch (error) {
    console.error('Barttorvik error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch data',
    }, { status: 500 });
  }
}

async function fetchRatings(): Promise<BTRating[]> {
  console.log('Launching Puppeteer for ratings...');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    
    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Navigate to the ratings page
    const url = 'https://barttorvik.com/trank.php?year=2026';
    console.log('Navigating to:', url);
    
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait for the table to load
    await page.waitForSelector('table', { timeout: 10000 });
    
    // Scroll to bottom to trigger lazy loading of all rows
    // Keep scrolling until no new rows appear
    let previousRowCount = 0;
    let currentRowCount = 0;
    let scrollAttempts = 0;
    const maxScrollAttempts = 20;
    
    do {
      previousRowCount = currentRowCount;
      
      // Scroll to bottom
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      
      // Wait for potential new content to load
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Count current rows
      currentRowCount = await page.evaluate(() => {
        return document.querySelectorAll('table tbody tr').length;
      });
      
      scrollAttempts++;
      console.log(`Scroll attempt ${scrollAttempts}: ${currentRowCount} rows`);
      
    } while (currentRowCount > previousRowCount && scrollAttempts < maxScrollAttempts);
    
    console.log(`Final row count after scrolling: ${currentRowCount}`);
    
    // Extract data from the table
    const ratings = await page.evaluate(() => {
      const rows = document.querySelectorAll('table tbody tr');
      const data: {
        rank: number;
        team: string;
        conf: string;
        record: string;
        adj_o: number;
        adj_d: number;
        adj_t: number;
        barthag: number;
      }[] = [];
      
      rows.forEach((row) => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 8) return;
        
        // Skip header rows (they have th elements or first cell isn't a number)
        const firstCellText = cells[0]?.textContent?.trim() || '';
        const rank = parseInt(firstCellText, 10);
        if (isNaN(rank)) return; // Skip if first cell isn't a rank number
        
        // Find the team link
        const teamLink = row.querySelector('a[href*="team.php"]');
        if (!teamLink) return;
        
        // Clean team name: strip everything after "(" and trim whitespace
        // e.g., "Xavier   (A) 51 Seton Hall" -> "Xavier"
        let teamName = teamLink.textContent?.trim() || '';
        const parenIndex = teamName.indexOf('(');
        if (parenIndex > 0) {
          teamName = teamName.substring(0, parenIndex).trim();
        }
        
        // Get cell values
        const cellValues = Array.from(cells).map(cell => cell.textContent?.trim() || '');
        
        // Find conference (usually has a link to conf.php)
        const confLink = row.querySelector('a[href*="conf"]');
        const conf = confLink?.textContent?.trim() || cellValues[2] || '';
        
        // Find record (format: XX-XX)
        const recordMatch = cellValues.find(v => /^\d+-\d+$/.test(v));
        
        // Find numeric values
        const numbers = cellValues
          .map(v => parseFloat(v))
          .filter(n => !isNaN(n));
        
        data.push({
          rank: rank, // Use actual rank from first cell
          team: teamName,
          conf: conf,
          record: recordMatch || '',
          adj_o: numbers.find(n => n > 90 && n < 140) || 0, // AdjO typically 90-140
          adj_d: numbers.find(n => n > 80 && n < 120) || 0, // AdjD typically 80-120
          adj_t: numbers.find(n => n > 60 && n < 80) || 0,  // AdjT typically 60-80
          barthag: numbers.find(n => n > 0 && n < 1) || 0,  // Barthag is 0-1
        });
      });
      
      return data;
    });
    
    console.log(`Extracted ${ratings.length} ratings`);
    return ratings;
    
  } finally {
    await browser.close();
  }
}

async function fetchScheduleForDate(dateStr?: string): Promise<BTGame[]> {
  console.log('Launching Puppeteer for schedule...');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Build URL with optional date parameter (format: YYYYMMDD)
    const url = dateStr 
      ? `https://barttorvik.com/schedule.php?date=${dateStr}&conlimit=`
      : 'https://barttorvik.com/schedule.php';
    console.log('Navigating to:', url);
    
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait for content to load
    await page.waitForSelector('table', { timeout: 10000 });
    
    // Extract schedule data
    const games = await page.evaluate(() => {
      const rows = document.querySelectorAll('table tr');
      const data: {
        date: string;
        time: string;
        away_team: string;
        home_team: string;
        away_rank?: number;
        home_rank?: number;
        spread?: number;
        total?: number;
        status: 'scheduled' | 'in_progress' | 'final';
        neutral?: boolean;
        predicted_spread?: number;
        predicted_total?: number;
        away_win_prob?: number;
        home_win_prob?: number;
      }[] = [];
      
      // Get the date from the page header
      const dateHeader = document.body.textContent?.match(/Games Scheduled for (\d{2}\/\d{2}\/\d{4})/);
      const gameDate = dateHeader ? dateHeader[1] : new Date().toLocaleDateString('en-US');
      
      // Convert MM/DD/YYYY to YYYY-MM-DD for consistency
      const [month, day, year] = gameDate.split('/');
      const formattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      
      rows.forEach((row) => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 5) return;
        
        // Get text content from cells
        const cellTexts = Array.from(cells).map(cell => cell.textContent?.trim() || '');
        
        // Find team links - there should be 2 team links per row
        const teamLinks = row.querySelectorAll('a[href*="team.php"]');
        if (teamLinks.length < 2) return;
        
        // First team link is away, second is home
        const awayTeam = teamLinks[0].textContent?.trim() || '';
        const homeTeam = teamLinks[1].textContent?.trim() || '';
        
        if (!awayTeam || !homeTeam) return;
        
        // Find the time (format: HH:MM or H:MM, possibly with AM/PM)
        const timeMatch = cellTexts.find(t => /^\d{1,2}:\d{2}/.test(t));
        const time = timeMatch || '';
        
        // Extract ranks if present (usually in parentheses or before team name)
        const awayRankMatch = cellTexts[0]?.match(/^(\d+)/);
        const homeRankMatch = cellTexts[2]?.match(/^(\d+)/);
        const awayRank = awayRankMatch ? parseInt(awayRankMatch[1]) : undefined;
        const homeRank = homeRankMatch ? parseInt(homeRankMatch[1]) : undefined;
        
        // Look for T-RANK LINE data (format: "TeamName -X.X, YY-ZZ (PP%)")
        // This contains the predicted spread, total, and win probability
        const tRankCell = cellTexts.find(t => t.includes('%') && t.includes('-'));
        const tRankMatch = tRankCell?.match(/([A-Za-z\s.&']+?)\s+(-?\d+\.?\d*),?\s+(\d+)-(\d+)\s+\((\d+)%\)/);
        
        let predictedSpread: number | undefined;
        let predictedTotal: number | undefined;
        let homeWinProb: number | undefined;
        let awayWinProb: number | undefined;
        
        if (tRankMatch) {
          const favoredTeam = tRankMatch[1].trim();
          const spread = parseFloat(tRankMatch[2]);
          const score1 = parseInt(tRankMatch[3]);
          const score2 = parseInt(tRankMatch[4]);
          const winProb = parseInt(tRankMatch[5]) / 100;
          
          predictedTotal = score1 + score2;
          
          // Check if home team is favored (favored team name appears in T-RANK LINE)
          const homeFavored = favoredTeam.toLowerCase().includes(homeTeam.toLowerCase().substring(0, 4)) ||
                             homeTeam.toLowerCase().includes(favoredTeam.toLowerCase().substring(0, 4));
          
          if (homeFavored) {
            // Home team favored = negative spread (home team wins by X)
            predictedSpread = spread; // Keep as-is (already negative or will be interpreted as home favored)
            homeWinProb = winProb;
            awayWinProb = 1 - winProb;
          } else {
            // Away team favored = positive spread (away team wins by X)
            predictedSpread = -spread; // Flip sign for away favorite
            awayWinProb = winProb;
            homeWinProb = 1 - winProb;
          }
        }
        
        data.push({
          date: formattedDate,
          time: time,
          away_team: awayTeam,
          home_team: homeTeam,
          away_rank: awayRank,
          home_rank: homeRank,
          status: 'scheduled',
          neutral: false,
          predicted_spread: predictedSpread,
          predicted_total: predictedTotal,
          away_win_prob: awayWinProb,
          home_win_prob: homeWinProb,
        });
      });
      
      return data;
    });
    
    console.log(`Extracted ${games.length} games for ${dateStr || 'today'}`);
    return games;
    
  } finally {
    await browser.close();
  }
}

async function fetchSchedule(): Promise<BTGame[]> {
  // Get today through day+3 in YYYYMMDD format (Eastern time)
  const now = new Date();
  const eastern = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  
  const formatDate = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  };
  
  // Build array of 4 dates: today, tomorrow, +2, +3
  const dates: string[] = [];
  for (let i = 0; i < 4; i++) {
    const targetDate = new Date(eastern);
    targetDate.setDate(targetDate.getDate() + i);
    dates.push(formatDate(targetDate));
  }
  
  console.log(`Fetching BT schedule for 4 days: ${dates.join(', ')}`);
  
  // Fetch all 4 days in parallel
  const results = await Promise.all(
    dates.map(dateStr => fetchScheduleForDate(dateStr))
  );
  
  // Combine all games
  const allGames = results.flat();
  
  // Log breakdown
  console.log(`Total: ${allGames.length} games`);
  results.forEach((games, i) => {
    console.log(`  Day ${i} (${dates[i]}): ${games.length} games`);
  });
  
  return allGames;
}
