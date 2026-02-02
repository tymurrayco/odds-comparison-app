// src/app/api/ratings/sbr-odds/route.ts
// API route to scrape SBR NCAAB opener odds using Puppeteer

import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';

interface SBRGame {
  awayTeam: string;
  homeTeam: string;
  openerSpread: number | null;
  isComplete: boolean;
  awayScore: number | null;
  homeScore: number | null;
  gameTime: string;
}

// Strip ranking from team name: "(12) Purdue" -> "Purdue"
function stripRanking(name: string): string {
  return name.replace(/^\(\d+\)\s*/, '').trim();
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
  
  let browser;
  
  try {
    const url = `https://www.sportsbookreview.com/betting-odds/ncaa-basketball/?date=${date}`;
    
    console.log(`[SBR] Scraping odds for ${date}...`);
    
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080'
      ]
    });

    const page = await browser.newPage();
    
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    );
    
    await page.setViewport({ width: 1920, height: 1080 });

    await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: 45000 
    });

    // Wait for GameRow elements to load
    await page.waitForSelector('[class*="GameRows_eventMarketGridContainer"]', { timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));

    // Extract games directly from GameRow elements
    const games = await page.evaluate(() => {
      const results: {
        awayTeam: string;
        homeTeam: string;
        openerSpread: number | null;
        isComplete: boolean;
        awayScore: number | null;
        homeScore: number | null;
        gameTime: string;
      }[] = [];
      
      // Get all GameRow containers - these have the FULL game data including odds
      const gameRows = document.querySelectorAll('[class*="GameRows_eventMarketGridContainer"]');
      
      gameRows.forEach((row) => {
        try {
          const rowText = row.textContent || '';
          
          // Extract team names from matchup links within this row
          const teamLinks = row.querySelectorAll('a[href*="/matchup/"]');
          const teams: string[] = [];
          
          teamLinks.forEach(tl => {
            const text = tl.textContent?.trim();
            if (text && text !== 'Matchup' && text.length > 2 && !/^\d+$/.test(text) && !teams.includes(text)) {
              teams.push(text);
            }
          });
          
          // Need exactly 2 teams for a valid game
          if (teams.length < 2) return;
          
          // Extract time - pattern like "12:00 PM EST"
          const timeMatch = rowText.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)\s*(?:EST|CST|MST|PST|ET)?)/i);
          const gameTime = timeMatch?.[1]?.trim() || 'TBD';
          
          // Extract scores (for completed games)
          // Scores appear right after team names: "Illinois78Nebraska69..."
          let awayScore: number | null = null;
          let homeScore: number | null = null;
          
          // Use the team names we extracted to find scores
          // Strip any ranking prefix like "(9) " from team names for matching
          const cleanTeam1 = teams[0].replace(/^\(\d+\)\s*/, '');
          const cleanTeam2 = teams[1].replace(/^\(\d+\)\s*/, '');
          
          // Helper to find score after team name
          const findScore = (teamName: string): number | null => {
            const escaped = teamName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            
            // Try 3-digit score first (100-150), then 2-digit (40-99)
            const pattern3 = new RegExp(escaped + '(1[0-4]\\d|150)', 'i');
            const match3 = rowText.match(pattern3);
            if (match3 && match3[1]) {
              return parseInt(match3[1]);
            }
            
            // 2-digit score (40-99)
            const pattern2 = new RegExp(escaped + '([4-9]\\d)', 'i');
            const match2 = rowText.match(pattern2);
            if (match2 && match2[1]) {
              return parseInt(match2[1]);
            }
            
            return null;
          };
          
          awayScore = findScore(cleanTeam1);
          homeScore = findScore(cleanTeam2);
          
          // Extract opener spread
          // Format in the text: "+1.5-105-1.5-115+2.5-115..." (no spaces!)
          // Pattern: [+-]X.X-YYY where X.X is spread and YYY is juice
          let openerSpread: number | null = null;
          
          // Find the OPENER section - it comes after the WAGERS percentages
          // The row text pattern is: ...56%44%+1.5-105-1.5-115...
          // First spread after percentages is the opener for away team
          
          // Match: percentage pattern followed by spreads
          const afterPercentages = rowText.match(/\d+%\s*\d+%\s*(.*)/);
          if (afterPercentages && afterPercentages[1]) {
            const oddsSection = afterPercentages[1];
            
            // First spread pattern in odds section is the opener
            // Pattern: +X.X-YYY or -X.X-YYY (spread followed immediately by juice)
            const spreadMatch = oddsSection.match(/^([+-]?\d+\.?\d*)-\d{3}/);
            if (spreadMatch && spreadMatch[1]) {
              openerSpread = parseFloat(spreadMatch[1]);
            }
          }
          
          // Fallback: if no percentage pattern found, just find first spread pattern
          if (openerSpread === null) {
            const allSpreads = rowText.match(/([+-]\d+\.?\d*)-\d{3}/g);
            if (allSpreads && allSpreads.length > 0) {
              const match = allSpreads[0].match(/([+-]?\d+\.?\d*)/);
              if (match) {
                openerSpread = parseFloat(match[1]);
              }
            }
          }
          
          results.push({
            awayTeam: teams[0],
            homeTeam: teams[1],
            // Negate to show from home team perspective (SBR shows away team's spread first)
            openerSpread: openerSpread !== null ? -openerSpread : null,
            isComplete: awayScore !== null && homeScore !== null,
            awayScore,
            homeScore,
            gameTime
          });
          
        } catch {
          // Skip errors
        }
      });
      
      return results;
    });

    // Strip rankings from team names
    const cleanedGames: SBRGame[] = games.map((g: SBRGame) => ({
      awayTeam: stripRanking(g.awayTeam),
      homeTeam: stripRanking(g.homeTeam),
      openerSpread: g.openerSpread,
      isComplete: g.isComplete,
      awayScore: g.awayScore,
      homeScore: g.homeScore,
      gameTime: g.gameTime
    }));

    console.log(`[SBR] Found ${cleanedGames.length} games`);
    if (cleanedGames.length > 0) {
      console.log(`[SBR] Sample: ${cleanedGames[0].awayTeam} @ ${cleanedGames[0].homeTeam}, opener: ${cleanedGames[0].openerSpread}`);
    }

    return NextResponse.json({
      date,
      scrapedAt: new Date().toISOString(),
      source: 'sportsbookreview.com',
      gameCount: cleanedGames.length,
      games: cleanedGames
    });

  } catch (error) {
    console.error('[SBR] Scrape error:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to scrape SBR odds',
        date,
        games: []
      },
      { status: 500 }
    );
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
