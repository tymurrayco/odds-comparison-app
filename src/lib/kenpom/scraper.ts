// src/lib/kenpom/scraper.ts

import { Browser, Page } from 'puppeteer';
import { FanmatchGame, BoxScore, KenpomGame } from './types';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const REQUEST_DELAY_MS = 3500;
const BULK_PAUSE_EVERY = 50;
const BULK_PAUSE_MS = 10000;
const CONSECUTIVE_FAIL_THRESHOLD = 5;

// Dynamic import to avoid webpack bundling issues with puppeteer-extra
async function launchStealthBrowser(): Promise<Browser> {
  const puppeteerExtra = (await import('puppeteer-extra')).default;
  const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;
  puppeteerExtra.use(StealthPlugin());
  return puppeteerExtra.launch({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    headless: 'new' as any,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  }) as unknown as Browser;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// Browser & Login
// ============================================

async function login(page: Page): Promise<boolean> {
  const email = process.env.KENPOM_EMAIL;
  const password = process.env.KENPOM_PASSWORD;

  if (!email || !password) {
    throw new Error('Missing KENPOM_EMAIL or KENPOM_PASSWORD environment variables');
  }

  console.log('Navigating to KenPom...');
  await page.goto('https://kenpom.com/', { waitUntil: 'networkidle2', timeout: 60000 });

  // Check if already logged in
  const alreadyLoggedIn = await page.evaluate(() =>
    document.body.textContent?.includes('Logged in as') ?? false
  );
  if (alreadyLoggedIn) {
    console.log('Already logged in');
    return true;
  }

  // Login form is on the homepage
  await page.waitForSelector('input[name="email"]', { timeout: 10000 });
  await page.type('input[name="email"]', email);
  await page.type('input[name="password"]', password);

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
    page.click('input[type="submit"]'),
  ]);

  // Verify login via "Logged in as" text
  const loggedIn = await page.evaluate(() =>
    document.body.textContent?.includes('Logged in as') ?? false
  );
  return loggedIn;
}

export async function launchAndLogin(): Promise<{ browser: Browser; page: Page }> {
  const browser = await launchStealthBrowser();
  const page = await browser.newPage();
  await page.setUserAgent(USER_AGENT);

  const success = await login(page);
  if (!success) {
    await browser.close();
    throw new Error('KenPom login failed — "Logged in as" text not found after submit');
  }

  console.log('KenPom login successful');
  return { browser, page };
}

// Check if we're still logged in (detect Cloudflare challenge or logged-out state)
async function isSessionAlive(page: Page): Promise<boolean> {
  try {
    const alive = await page.evaluate(() => {
      const body = document.body.textContent || '';
      // Cloudflare challenge indicators
      if (body.includes('Verifying you are human') || body.includes('Enable JavaScript and cookies')) {
        return false;
      }
      // KenPom logged-in indicator
      if (body.includes('Logged in as')) return true;
      // KenPom content indicator (tables, team data)
      if (document.querySelector('#linescore-table2') || document.querySelector('#fanmatch-table')) return true;
      // If we see the login form, session is dead
      if (document.querySelector('input[name="email"]')) return false;
      // Default: assume alive if page has substantial content
      return body.length > 500;
    });
    return alive;
  } catch {
    return false;
  }
}

// Re-login: close old browser, launch fresh
async function relogin(oldBrowser: Browser): Promise<{ browser: Browser; page: Page }> {
  console.log('Session lost — relaunching browser and re-logging in...');
  try { await oldBrowser.close(); } catch { /* ignore */ }
  await delay(3000);
  return launchAndLogin();
}

// ============================================
// Fanmatch Parser
// ============================================

export async function scrapeFanmatch(page: Page, date: string): Promise<FanmatchGame[]> {
  const url = `https://kenpom.com/fanmatch.php?d=${date}`;
  console.log(`Scraping fanmatch: ${url}`);

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await delay(REQUEST_DELAY_MS);

  const games = await page.evaluate(() => {
    const results: {
      gameId: string;
      homeTeam: string;
      awayTeam: string;
      predictedHomeScore: number;
      predictedAwayScore: number;
    }[] = [];

    const table = document.getElementById('fanmatch-table');
    if (!table) return results;

    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length < 3) return;

      // Extract game ID from box score link: href="/box.php?g=4546"
      const boxLink = row.querySelector('a[href*="box.php"]') as HTMLAnchorElement | null;
      if (!boxLink) return;

      const href = boxLink.getAttribute('href') || '';
      const idMatch = href.match(/box\.php\?g=(\d+)/);
      if (!idMatch) return;
      const gameId = idMatch[1];

      // Get team names from team.php links
      const teamLinks = row.querySelectorAll('a[href*="team.php"]');
      if (teamLinks.length < 2) return;

      const homeTeam = teamLinks[0].textContent?.trim() || '';
      const awayTeam = teamLinks[1].textContent?.trim() || '';

      // Parse prediction cell (cell[1]): "Arizona 75-72 (61%) [70]"
      // Format: "FavoriteTeam HighScore-LowScore (WinProb%) [Total]"
      const predText = cells[1]?.textContent?.trim() || '';
      const predMatch = predText.match(/(.+?)\s+(\d+)-(\d+)\s+\(/);
      if (!predMatch) return;

      const favTeam = predMatch[1].trim();
      const favScore = parseInt(predMatch[2], 10);
      const underdogScore = parseInt(predMatch[3], 10);

      // Assign scores based on which team is the favorite
      let predictedHomeScore: number;
      let predictedAwayScore: number;

      const favLower = favTeam.toLowerCase();
      const homeLower = homeTeam.toLowerCase();
      if (favLower === homeLower || homeLower.includes(favLower) || favLower.includes(homeLower)) {
        predictedHomeScore = favScore;
        predictedAwayScore = underdogScore;
      } else {
        predictedHomeScore = underdogScore;
        predictedAwayScore = favScore;
      }

      results.push({
        gameId,
        homeTeam,
        awayTeam,
        predictedHomeScore,
        predictedAwayScore,
      });
    });

    return results;
  });

  console.log(`  Found ${games.length} games on ${date}`);
  return games;
}

// ============================================
// Box Score Parser
// ============================================

export async function scrapeBoxScore(
  page: Page,
  gameId: string,
  expectedHome: string,
  expectedAway: string
): Promise<BoxScore | 'blocked' | null> {
  const url = `https://kenpom.com/box.php?g=${gameId}`;

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Check if we hit Cloudflare or lost session
    const sessionOk = await isSessionAlive(page);
    if (!sessionOk) return 'blocked';

    const result = await page.evaluate((expHome: string, expAway: string) => {
      const table = document.getElementById('linescore-table2');
      if (!table) return null;

      const rows = table.querySelectorAll('tr');
      const dataRows: Element[] = [];
      for (const row of Array.from(rows)) {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 5) {
          const first = cells[0]?.textContent?.trim() || '';
          if (first && !['', 'Q1', 'Q2', 'Q3', 'Q4', 'T'].includes(first)) {
            dataRows.push(row);
          }
        }
      }

      if (dataRows.length < 2) return null;

      const parseRow = (row: Element) => {
        const cells = row.querySelectorAll('td');
        const values = Array.from(cells).map(c => c.textContent?.trim() || '');
        const teamName = values[0] || '';
        const nums = values.slice(1).map(v => parseInt(v, 10)).filter(n => !isNaN(n));
        return { teamName, nums };
      };

      const row1 = parseRow(dataRows[0]);
      const row2 = parseRow(dataRows[1]);

      if (row1.nums.length < 5 || row2.nums.length < 5) return null;

      let awayRow = row1;
      let homeRow = row2;

      const r1Lower = row1.teamName.toLowerCase();
      const homeLower = expHome.toLowerCase();
      const awayLower = expAway.toLowerCase();

      if (r1Lower.includes(homeLower.substring(0, 5)) && !r1Lower.includes(awayLower.substring(0, 5))) {
        homeRow = row1;
        awayRow = row2;
      } else if (r1Lower.includes(awayLower.substring(0, 5)) && !r1Lower.includes(homeLower.substring(0, 5))) {
        awayRow = row1;
        homeRow = row2;
      }

      return {
        homeTeam: homeRow.teamName,
        awayTeam: awayRow.teamName,
        homeQuarters: [homeRow.nums[0], homeRow.nums[1], homeRow.nums[2], homeRow.nums[3]] as [number, number, number, number],
        awayQuarters: [awayRow.nums[0], awayRow.nums[1], awayRow.nums[2], awayRow.nums[3]] as [number, number, number, number],
        homeTotal: homeRow.nums[4],
        awayTotal: awayRow.nums[4],
      };
    }, expectedHome, expectedAway);

    if (!result) return null;

    return { gameId, ...result };
  } catch (err) {
    console.error(`  Error scraping box score g=${gameId}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

// ============================================
// Orchestrator: Scrape a date range
// ============================================

export interface ScrapeResult {
  gamesFound: number;
  gamesSaved: number;
  boxScoresScraped: number;
  errors: string[];
  datesProcessed: number;
  relogins: number;
}

export async function scrapeKenpomDateRange(
  startDate: string,
  endDate: string,
  season: number,
  saveFn: (games: KenpomGame[]) => Promise<void>,
): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    gamesFound: 0,
    gamesSaved: 0,
    boxScoresScraped: 0,
    errors: [],
    datesProcessed: 0,
    relogins: 0,
  };

  let { browser, page } = await launchAndLogin();

  try {
    const dates: string[] = [];
    const current = new Date(startDate + 'T12:00:00');
    const end = new Date(endDate + 'T12:00:00');

    while (current <= end) {
      const y = current.getFullYear();
      const m = String(current.getMonth() + 1).padStart(2, '0');
      const d = String(current.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${d}`);
      current.setDate(current.getDate() + 1);
    }

    console.log(`Processing ${dates.length} dates from ${startDate} to ${endDate}`);

    let totalBoxRequests = 0;
    let consecutiveFails = 0;

    for (const date of dates) {
      try {
        const fanmatchGames = await scrapeFanmatch(page, date);
        result.gamesFound += fanmatchGames.length;
        result.datesProcessed++;
        consecutiveFails = 0; // fanmatch worked, session is alive

        if (fanmatchGames.length === 0) continue;

        const gamesToSave: KenpomGame[] = fanmatchGames.map(fg => ({
          kenpom_game_id: fg.gameId,
          game_date: date,
          season,
          home_team: fg.homeTeam,
          away_team: fg.awayTeam,
          predicted_home_score: fg.predictedHomeScore,
          predicted_away_score: fg.predictedAwayScore,
          home_q1: null, home_q2: null, home_q3: null, home_q4: null, home_total: null,
          away_q1: null, away_q2: null, away_q3: null, away_q4: null, away_total: null,
          has_predictions: true,
          has_box_score: false,
        }));

        for (const fg of fanmatchGames) {
          totalBoxRequests++;

          if (totalBoxRequests % BULK_PAUSE_EVERY === 0) {
            console.log(`  Pausing ${BULK_PAUSE_MS / 1000}s after ${totalBoxRequests} box score requests...`);
            await delay(BULK_PAUSE_MS);
          }

          await delay(REQUEST_DELAY_MS);

          const boxScore = await scrapeBoxScore(page, fg.gameId, fg.homeTeam, fg.awayTeam);

          if (boxScore === 'blocked') {
            // Session lost — relogin
            console.log(`  Blocked on g=${fg.gameId}, re-logging in...`);
            ({ browser, page } = await relogin(browser));
            result.relogins++;
            consecutiveFails = 0;

            // Retry this game after relogin
            await delay(REQUEST_DELAY_MS);
            const retry = await scrapeBoxScore(page, fg.gameId, fg.homeTeam, fg.awayTeam);
            if (retry && retry !== 'blocked') {
              consecutiveFails = 0;
              result.boxScoresScraped++;
              const game = gamesToSave.find(g => g.kenpom_game_id === fg.gameId);
              if (game) {
                game.home_q1 = retry.homeQuarters[0]; game.home_q2 = retry.homeQuarters[1];
                game.home_q3 = retry.homeQuarters[2]; game.home_q4 = retry.homeQuarters[3];
                game.home_total = retry.homeTotal;
                game.away_q1 = retry.awayQuarters[0]; game.away_q2 = retry.awayQuarters[1];
                game.away_q3 = retry.awayQuarters[2]; game.away_q4 = retry.awayQuarters[3];
                game.away_total = retry.awayTotal;
                game.has_box_score = true;
              }
            }
            continue;
          }

          if (boxScore) {
            consecutiveFails = 0;
            result.boxScoresScraped++;
            const game = gamesToSave.find(g => g.kenpom_game_id === fg.gameId);
            if (game) {
              game.home_q1 = boxScore.homeQuarters[0]; game.home_q2 = boxScore.homeQuarters[1];
              game.home_q3 = boxScore.homeQuarters[2]; game.home_q4 = boxScore.homeQuarters[3];
              game.home_total = boxScore.homeTotal;
              game.away_q1 = boxScore.awayQuarters[0]; game.away_q2 = boxScore.awayQuarters[1];
              game.away_q3 = boxScore.awayQuarters[2]; game.away_q4 = boxScore.awayQuarters[3];
              game.away_total = boxScore.awayTotal;
              game.has_box_score = true;
            }
          } else {
            consecutiveFails++;
            if (consecutiveFails >= CONSECUTIVE_FAIL_THRESHOLD) {
              console.log(`  ${CONSECUTIVE_FAIL_THRESHOLD} consecutive box score failures — re-logging in...`);
              ({ browser, page } = await relogin(browser));
              result.relogins++;
              consecutiveFails = 0;
            }
          }
        }

        await saveFn(gamesToSave);
        result.gamesSaved += gamesToSave.length;

      } catch (err) {
        const msg = `Error on date ${date}: ${err instanceof Error ? err.message : err}`;
        console.error(msg);
        result.errors.push(msg);

        // Likely a session issue — try relogin
        try {
          ({ browser, page } = await relogin(browser));
          result.relogins++;
        } catch (reloginErr) {
          result.errors.push(`Relogin failed: ${reloginErr instanceof Error ? reloginErr.message : reloginErr}`);
        }
        await delay(3000);
      }
    }

    return result;
  } finally {
    await browser.close();
  }
}

// ============================================
// Backfill box scores only (for games already in DB)
// ============================================

export async function backfillBoxScores(
  games: KenpomGame[],
  saveFn: (games: KenpomGame[]) => Promise<void>,
): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    gamesFound: games.length,
    gamesSaved: 0,
    boxScoresScraped: 0,
    errors: [],
    datesProcessed: 0,
    relogins: 0,
  };

  const needsBoxScore = games.filter(g => !g.has_box_score);
  console.log(`Backfilling box scores for ${needsBoxScore.length} games (${games.length} total)`);

  if (needsBoxScore.length === 0) return result;

  let { browser, page } = await launchAndLogin();

  try {
    let consecutiveFails = 0;
    const batch: KenpomGame[] = [];

    for (let i = 0; i < needsBoxScore.length; i++) {
      const game = needsBoxScore[i];

      if ((i + 1) % BULK_PAUSE_EVERY === 0) {
        console.log(`  Pausing ${BULK_PAUSE_MS / 1000}s after ${i + 1} requests...`);
        await delay(BULK_PAUSE_MS);
      }

      await delay(REQUEST_DELAY_MS);

      const boxScore = await scrapeBoxScore(page, game.kenpom_game_id, game.home_team, game.away_team);

      if (boxScore === 'blocked') {
        console.log(`  Blocked on g=${game.kenpom_game_id}, re-logging in...`);
        ({ browser, page } = await relogin(browser));
        result.relogins++;
        consecutiveFails = 0;

        // Retry
        await delay(REQUEST_DELAY_MS);
        const retry = await scrapeBoxScore(page, game.kenpom_game_id, game.home_team, game.away_team);
        if (retry && retry !== 'blocked') {
          game.home_q1 = retry.homeQuarters[0]; game.home_q2 = retry.homeQuarters[1];
          game.home_q3 = retry.homeQuarters[2]; game.home_q4 = retry.homeQuarters[3];
          game.home_total = retry.homeTotal;
          game.away_q1 = retry.awayQuarters[0]; game.away_q2 = retry.awayQuarters[1];
          game.away_q3 = retry.awayQuarters[2]; game.away_q4 = retry.awayQuarters[3];
          game.away_total = retry.awayTotal;
          game.has_box_score = true;
          result.boxScoresScraped++;
          batch.push(game);
        }
        continue;
      }

      if (boxScore) {
        consecutiveFails = 0;
        game.home_q1 = boxScore.homeQuarters[0]; game.home_q2 = boxScore.homeQuarters[1];
        game.home_q3 = boxScore.homeQuarters[2]; game.home_q4 = boxScore.homeQuarters[3];
        game.home_total = boxScore.homeTotal;
        game.away_q1 = boxScore.awayQuarters[0]; game.away_q2 = boxScore.awayQuarters[1];
        game.away_q3 = boxScore.awayQuarters[2]; game.away_q4 = boxScore.awayQuarters[3];
        game.away_total = boxScore.awayTotal;
        game.has_box_score = true;
        result.boxScoresScraped++;
        batch.push(game);
      } else {
        consecutiveFails++;
        if (consecutiveFails >= CONSECUTIVE_FAIL_THRESHOLD) {
          console.log(`  ${CONSECUTIVE_FAIL_THRESHOLD} consecutive failures — re-logging in...`);
          ({ browser, page } = await relogin(browser));
          result.relogins++;
          consecutiveFails = 0;
        }
      }

      // Save in batches of 100
      if (batch.length >= 100) {
        await saveFn(batch.splice(0));
        result.gamesSaved += 100;
        console.log(`  Saved batch. Progress: ${result.boxScoresScraped}/${needsBoxScore.length}`);
      }
    }

    // Save remaining
    if (batch.length > 0) {
      await saveFn(batch);
      result.gamesSaved += batch.length;
    }

    console.log(`Backfill complete: ${result.boxScoresScraped}/${needsBoxScore.length} box scores, ${result.relogins} relogins`);
    return result;
  } finally {
    await browser.close();
  }
}
