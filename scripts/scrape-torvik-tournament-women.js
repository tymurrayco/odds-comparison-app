#!/usr/bin/env node

/**
 * Torvik NCAA Women's Tournament Dataset Builder
 *
 * Scrapes barttorvik.com/ncaaw/trank.php to build a comprehensive dataset of
 * NCAA women's tournament team stats across multiple years and 3 game-type splits.
 *
 * Output: data/torvik-tournament-dataset-women.csv
 *
 * Usage:
 *   node scripts/scrape-torvik-tournament-women.js                  # Full scrape 2015-2025
 *   node scripts/scrape-torvik-tournament-women.js --start 2022     # Start from 2022
 *   node scripts/scrape-torvik-tournament-women.js --year 2025      # Single year only
 *   node scripts/scrape-torvik-tournament-women.js --test           # Test mode: 2025, one split
 *   node scripts/scrape-torvik-tournament-women.js --discover 2025  # Print filter options for a year
 *   node scripts/scrape-torvik-tournament-women.js --discover-talent 2025  # Discover talent page structure
 *   node scripts/scrape-torvik-tournament-women.js --discover-region 2025 # Discover Wikipedia region structure
 *   node scripts/scrape-torvik-tournament-women.js --resume         # Resume from last completed year
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DELAY_BETWEEN_PAGES_MS = 4000;   // Safe delay to avoid IP bans
const PAGE_LOAD_TIMEOUT      = 45000;
const SCROLL_WAIT_MS         = 600;
const MAX_SCROLL_ATTEMPTS    = 25;
const DATA_DIR               = path.join(__dirname, '..', 'data');
const OUTPUT_FILE            = path.join(DATA_DIR, 'torvik-tournament-dataset-women.csv');
const PROGRESS_FILE          = path.join(DATA_DIR, '.torvik-scrape-progress-women.json');

// Women's Torvik ratings exist back to at least 2015, but the conlimit=NCAA filter
// only works from 2022+. For 2015-2019, we scrape all teams and filter to tournament
// teams using Wikipedia bracket data as the source of truth.
const DEFAULT_START_YEAR = 2015;
const DEFAULT_END_YEAR   = 2025;

// Years where Torvik's conlimit=NCAA filter correctly returns tournament teams only.
// For years before this, we scrape all teams and filter via Wikipedia.
const TORVIK_NCAA_FILTER_START = 2022;

// URL filter definitions — discovered via --discover mode on the actual page.
//
// ncaaw/trank.php params:
//   conlimit=NCAA  -> NCAA tournament teams only
//   year=YYYY      -> season
//   type=R         -> Regular Season  (other values: N=Noncon, C=Con, P=Postseason, T=NCAA T)
//   quad=3         -> Quad 2 level    (values: 1=Q1-A, 2=Q1, 3=Q2, 4=Q3, 5=Q4 default)
//   revquad=1      -> "≥" direction   (0="≤" default, 1="≥")
//   venue=All      -> All venues      (H=Home, A=Away, N=Neutral, A-N=Away+Neutral)
//   showcol=All    -> Show all stat columns

const SPLITS = {
  reg: {
    label: 'Regular Season',
    prefix: 'reg',
    params: { type: 'R', showcol: 'All' },
  },
  nonconf: {
    label: 'Non-Conference',
    prefix: 'nc',
    params: { type: 'N', showcol: 'All' },
  },
  q1q2: {
    label: 'Q1 + Q2',
    prefix: 'q12',
    // "≥ Quad 2" means Quad 1 + Quad 2 games
    params: { quad: '3', revquad: '1', showcol: 'All' },
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    startYear: DEFAULT_START_YEAR,
    endYear: DEFAULT_END_YEAR,
    test: false,
    discover: null,
    discoverTalent: null,
    discoverRegion: null,
    resume: false,
    singleYear: null,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--start':
        opts.startYear = parseInt(args[++i], 10);
        break;
      case '--end':
        opts.endYear = parseInt(args[++i], 10);
        break;
      case '--year':
        opts.singleYear = parseInt(args[++i], 10);
        opts.startYear = opts.singleYear;
        opts.endYear = opts.singleYear;
        break;
      case '--test':
        opts.test = true;
        opts.startYear = 2025;
        opts.endYear = 2025;
        break;
      case '--discover':
        opts.discover = parseInt(args[++i], 10) || 2025;
        break;
      case '--discover-talent':
        opts.discoverTalent = parseInt(args[++i], 10) || 2025;
        break;
      case '--discover-region':
        opts.discoverRegion = parseInt(args[++i], 10) || 2025;
        break;
      case '--resume':
        opts.resume = true;
        break;
    }
  }

  return opts;
}

function buildUrl(year, extraParams = {}, { useNcaaFilter = true } = {}) {
  const base = 'https://barttorvik.com/ncaaw/trank.php';
  const baseParams = { year: String(year) };
  if (useNcaaFilter) baseParams.conlimit = 'NCAA';
  const params = new URLSearchParams({ ...baseParams, ...extraParams });
  return `${base}?${params.toString()}`;
}

function buildTalentUrl(year) {
  const base = 'https://barttorvik.com/ncaaw/team-tables_each.php';
  const params = new URLSearchParams({
    year: String(year),
    conlimit: 'NCAA',
  });
  return `${base}?${params.toString()}`;
}

function sanitizeHeader(raw) {
  // Clean a table header into a usable column name
  return raw
    .replace(/[%]/g, 'Pct')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    }
  } catch {}
  return { completedYears: [] };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// ---------------------------------------------------------------------------
// Wikipedia region scraping — team name mapping
// ---------------------------------------------------------------------------

// Wikipedia team name -> Barttorvik team name for known mismatches.
// The general " State" -> " St." rule is applied automatically; this map
// handles everything else.
const WIKI_TEAM_NAME_MAP = {
  // Common abbreviation differences
  'UConn': 'Connecticut',
  'Ole Miss': 'Mississippi',
  'NC State': 'N.C. State',
  'UNC': 'North Carolina',
  'Miami (FL)': 'Miami FL',
  'Miami (Ohio)': 'Miami OH',
  'Miami (OH)': 'Miami OH',
  'McNeese': 'McNeese St.',

  // "Saint" vs "St." — Barttorvik uses both forms depending on the school
  // Schools where Barttorvik uses "Saint":
  //   Saint Mary's, Saint Joseph's, Saint Francis, Saint Louis, Saint Peter's, Saint Bonaventure
  // Schools where Barttorvik uses "St.":
  //   St. John's
  // Wikipedia sometimes adds state qualifiers:
  "Saint Mary's (CA)": "Saint Mary's",
  "Saint Mary's (California)": "Saint Mary's",

  // Texas system
  'Texas–Arlington': 'UT Arlington',     // em-dash
  'Texas-Arlington': 'UT Arlington',     // regular dash
  'UT San Antonio': 'UTSA',
  'Texas–San Antonio': 'UTSA',

  // Cal State system
  'Cal State Fullerton': 'Cal St. Fullerton',
  'Cal State Northridge': 'Cal St. Northridge',
  'Cal State Bakersfield': 'Cal St. Bakersfield',

  // Older name variants that may appear in Wikipedia pages
  'VCU': 'VCU',
  'ETSU': 'East Tennessee St.',
  'UAB': 'UAB',
  'UTEP': 'UTEP',
  'SMU': 'SMU',
  'UCF': 'UCF',
  'LIU Brooklyn': 'LIU',
  'USC': 'USC',
  'LSU': 'LSU',
  'Loyola (MD)': 'Loyola MD',
  'Loyola–Chicago': 'Loyola Chicago',
  'Loyola Chicago': 'Loyola Chicago',
  'UNC Asheville': 'UNC Asheville',
  'FGCU': 'Florida Gulf Coast',
  'FDU': 'Fairleigh Dickinson',
  'Fairleigh Dickinson': 'Fairleigh Dickinson',
  'Stephen F. Austin': 'Stephen F. Austin',
  'Middle Tennessee': 'Middle Tennessee St.',
  'Northwestern State': 'Northwestern St.',
  'Coastal Carolina': 'Coastal Carolina',
  'South Dakota State': 'South Dakota St.',
  'North Dakota State': 'North Dakota St.',
  'Weber State': 'Weber St.',
  'Morehead State': 'Morehead St.',
  'Kennesaw State': 'Kennesaw St.',
  'Jacksonville State': 'Jacksonville St.',
  'Grambling State': 'Grambling St.',
  'Alcorn State': 'Alcorn St.',
  'Alabama A&M': 'Alabama A&M',
  'Nebraska Omaha': 'Nebraska Omaha',
  'Nebraska–Omaha': 'Nebraska Omaha',
  'Omaha': 'Nebraska Omaha',

  // Single-word school names that clash with city names
  // (bracket tables contain both teams and venue cities)
  'American': 'American',

  // Schools with unique Wikipedia name variants
  'Long Island': 'LIU',
  'NC Central': 'North Carolina Central',
  'Virginia Commonwealth': 'VCU',
  'California-Irvine': 'UC Irvine',
  'UC-Irvine': 'UC Irvine',
  'Louisiana–Lafayette': 'Louisiana',
  'Louisiana-Lafayette': 'Louisiana',
  'Arkansas-Pine Bluff': 'Arkansas Pine Bluff',
  'Arkansas–Pine Bluff': 'Arkansas Pine Bluff',
  'Gardner–Webb': 'Gardner Webb',
  'Gardner-Webb': 'Gardner Webb',
  'Little Rock': 'Little Rock',
  'Arkansas–Little Rock': 'Little Rock',
  'Arkansas-Little Rock': 'Little Rock',
  'SE Missouri State': 'Southeast Missouri St.',
  'SE Missouri St.': 'Southeast Missouri St.',
  'Texas A&M–Corpus Christi': 'Texas A&M Corpus Chris',
  'Texas A&M-Corpus Christi': 'Texas A&M Corpus Chris',
  'Detroit Mercy': 'Detroit Mercy',
  'Detroit': 'Detroit Mercy',

  // Abbreviated state names used in older Wikipedia pages
  'North Carolina St.': 'N.C. State',
  'Pennsylvania': 'Penn',
  'UNI': 'Northern Iowa',
  'Western Ky.': 'Western Kentucky',
  'Central Ark.': 'Central Arkansas',
  'South Fla.': 'South Florida',
  'Western Ill.': 'Western Illinois',

  // Women's-specific Wikipedia name variants
  'Hawaiʻi': 'Hawaii',                        // Unicode ʻokina in Wikipedia
  'California Baptist': 'Cal Baptist',
  'UT Martin': 'Tennessee Martin',
  'UMass': 'Massachusetts',
  'IUPUI': 'IU Indy',
  'Bethune–Cookman': 'Bethune Cookman',        // em-dash in Wikipedia
  'Bethune-Cookman': 'Bethune Cookman',
};

/**
 * Try to match a Wikipedia team name to a Barttorvik team name.
 * @param {string} wikiName - Team name from Wikipedia
 * @param {Set<string>} torvikNames - Set of Barttorvik team names for the year
 * @returns {string|null|undefined} Matched Barttorvik name, null for known
 *          non-team entries (venues/cities), or undefined for genuine mismatches.
 */
function matchWikiTeamName(wikiName, torvikNames) {
  // 1. Exact match
  if (torvikNames.has(wikiName)) return wikiName;

  // 2. Explicit map (null = known non-team entry like a venue name)
  if (wikiName in WIKI_TEAM_NAME_MAP) {
    const mapped = WIKI_TEAM_NAME_MAP[wikiName];
    if (mapped === null) return null; // known venue, not a team
    if (torvikNames.has(mapped)) return mapped;
  }

  // 3. General " State" -> " St." substitution
  if (wikiName.endsWith(' State')) {
    const stDot = wikiName.replace(/ State$/, ' St.');
    if (torvikNames.has(stDot)) return stDot;
  }

  // 4. Strip parenthetical qualifiers: "Saint Mary's (CA)" -> "Saint Mary's"
  const stripped = wikiName.replace(/\s*\([^)]+\)$/, '');
  if (stripped !== wikiName && torvikNames.has(stripped)) return stripped;

  // 5. Try mapped value of stripped name
  const mappedStripped = WIKI_TEAM_NAME_MAP[stripped];
  if (mappedStripped && torvikNames.has(mappedStripped)) return mappedStripped;

  return undefined; // genuine mismatch
}

// ---------------------------------------------------------------------------
// Core scraping
// ---------------------------------------------------------------------------

/**
 * Scrape a single trank.php page and return all rows with dynamically-read columns.
 * Returns { headers: string[], rows: Array<Record<string, string>> }
 */
async function scrapePage(page, url) {
  console.log(`    Navigating: ${url}`);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: PAGE_LOAD_TIMEOUT });

  // Wait for the table to appear
  await page.waitForSelector('table', { timeout: 15000 });

  // Scroll to load all lazy-loaded rows
  let prevCount = 0;
  let curCount = 0;
  let scrollAttempt = 0;

  do {
    prevCount = curCount;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(SCROLL_WAIT_MS);
    curCount = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
    scrollAttempt++;
  } while (curCount > prevCount && scrollAttempt < MAX_SCROLL_ATTEMPTS);

  console.log(`    Loaded ${curCount} rows after ${scrollAttempt} scrolls`);

  // Extract headers + data from the table
  const result = await page.evaluate(() => {
    // Find the main data table (largest by row count)
    const tables = Array.from(document.querySelectorAll('table'));
    let table = tables[0];
    for (const t of tables) {
      if (t.querySelectorAll('tbody tr').length > (table ? table.querySelectorAll('tbody tr').length : 0)) {
        table = t;
      }
    }
    if (!table) return { headers: [], rows: [] };

    // Torvik's trank.php has a complex thead with summary stats in the top rows
    // and actual column headers in the last thead row. The real headers are the ones
    // that contain names like "Rk", "Team", "AdjOE", etc.
    // Strategy: find the thead row with the most cells that look like column names.
    const theadRows = table.querySelectorAll('thead tr');
    let bestHeaderRow = null;
    let bestScore = 0;

    const knownHeaders = ['rk', 'team', 'conf', 'rec', 'adjoe', 'adjde', 'barthag',
      'efg%', 'efgd%', 'tor', 'tord', 'orb', 'drb', 'ftr', 'ftrd',
      '2p%', '2p%d', '3p%', '3p%d', '3pr', '3prd', 'adj t.', 'wab', 'g'];

    theadRows.forEach(row => {
      const cells = row.querySelectorAll('th, td');
      let score = 0;
      cells.forEach(cell => {
        const text = (cell.textContent || '').trim().toLowerCase();
        // Check if this looks like a known header
        if (knownHeaders.some(h => text.startsWith(h) || text === h)) score++;
        // Also score short alphanumeric strings (likely headers, not data values)
        if (text.length > 0 && text.length <= 10 && /^[a-z%.\s]+$/i.test(text)) score += 0.3;
      });
      if (score > bestScore) {
        bestScore = score;
        bestHeaderRow = row;
      }
    });

    // If no good thead row found, fall back to first row
    if (!bestHeaderRow && theadRows.length > 0) {
      bestHeaderRow = theadRows[theadRows.length - 1]; // last thead row
    }

    const headers = [];
    if (bestHeaderRow) {
      bestHeaderRow.querySelectorAll('th, td').forEach(cell => {
        // Use concise text content, strip newlines and extra whitespace
        let text = (cell.textContent || '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
        // For columns like "Eff. FG%50.9" (header + avg merged), extract just the header part
        const match = text.match(/^([A-Za-z%.\s]+?)(\d)/);
        if (match && match[1].trim().length >= 2) {
          text = match[1].trim();
        }
        headers.push(text);
      });
    }

    // Torvik cell structure:
    //   Stat cells: "124.3<br><span class='lowrow'>8</span>"
    //     → value = "124.3", d1_rank = "8"
    //   Team cell: "<a href='team.php?...'>Houston<span class='lowrow'>1 seed, Finals</span></a>"
    //     → team name = "Houston", seed info in lowrow span
    //   Record cell: has multiple child nodes for overall + conf record

    // Helper: extract value + rank from a cell
    function parseStatCell(cell) {
      const lowrow = cell.querySelector('.lowrow, span[style*="font-size:8px"]');
      if (lowrow) {
        // Value is the text BEFORE the <br>/<span>
        const val = cell.childNodes[0]?.textContent?.trim() || '';
        const rank = lowrow.textContent.trim();
        return { value: val, rank: rank };
      }
      return { value: (cell.textContent || '').trim(), rank: '' };
    }

    // Extract data rows from tbody
    const rows = [];
    const bodyRows = table.querySelectorAll('tbody tr');

    bodyRows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length < 5) return;

      const rowData = {};
      let teamName = '';
      let seed = '';

      cells.forEach((cell, i) => {
        if (i >= headers.length) return;
        const header = headers[i];
        if (!header) return;
        const hLower = header.toLowerCase();

        // Team cell: extract clean name + seed
        if (hLower === 'team') {
          const link = cell.querySelector('a[href*="team.php"]');
          if (link) {
            // Team name is the first text node of the link (before any child spans)
            const firstText = link.childNodes[0]?.textContent?.trim() || '';
            teamName = firstText;
            // Seed is in the lowrow span: "1 seed, Finals"
            const lowrow = link.querySelector('.lowrow');
            if (lowrow) {
              const seedMatch = lowrow.textContent.match(/(\d+)\s*seed/);
              if (seedMatch) seed = seedMatch[1];
            }
          }
          rowData[header] = teamName;
          return;
        }

        // Record cell: <a>30–4</a><br><span>19–1</span> (overall + conf)
        if (hLower === 'rec') {
          const link = cell.querySelector('a');
          const span = cell.querySelector('span');
          const overall = (link ? link.textContent : '').trim().replace(/–/g, '-');
          const conf = (span ? span.textContent : '').trim().replace(/–/g, '-');
          rowData[header] = overall;
          if (conf) rowData['Conf_Rec'] = conf;
          return;
        }

        // Rank column (Rk): simple number, no lowrow
        if (hLower === 'rk' || hLower === 'g' || hLower === 'conf') {
          rowData[header] = (cell.textContent || '').trim();
          return;
        }

        // All other stat cells: extract value + D1 rank
        const parsed = parseStatCell(cell);
        rowData[header] = parsed.value;
        if (parsed.rank) {
          rowData[header + '_d1rk'] = parsed.rank;
        }
      });

      // Attach seed
      if (seed) rowData['_seed'] = seed;

      if (teamName && teamName.length > 1) {
        rows.push(rowData);
      }
    });

    // Add _seed to headers if we found seeds
    const hasSeed = rows.some(r => r['_seed']);
    if (hasSeed && !headers.includes('_seed')) {
      headers.push('_seed');
    }

    // Add dynamic headers for any extra keys (d1rk ranks, Conf_Rec, etc.)
    const extraHeaders = [];
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        if (!headers.includes(key) && !extraHeaders.includes(key)) {
          extraHeaders.push(key);
        }
      }
    }
    headers.push(...extraHeaders);

    return { headers, rows };
  });

  return result;
}

/**
 * Discover mode: print all available filter options on the page
 */
async function discoverFilters(page, year) {
  const url = buildUrl(year);
  console.log(`Discovering filters for ${year}...`);
  console.log(`URL: ${url}`);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: PAGE_LOAD_TIMEOUT });
  await page.waitForSelector('table', { timeout: 15000 });

  // Extract all select elements and their options
  const filters = await page.evaluate(() => {
    const selects = document.querySelectorAll('select');
    const result = [];
    selects.forEach(sel => {
      const name = sel.name || sel.id || sel.className || '(unnamed)';
      const options = [];
      sel.querySelectorAll('option').forEach(opt => {
        options.push({
          value: opt.value,
          text: opt.textContent.trim(),
          selected: opt.selected,
        });
      });
      result.push({ name, options });
    });
    return result;
  });

  // Also extract the table headers
  const headers = await page.evaluate(() => {
    const table = document.querySelector('table');
    if (!table) return [];
    const ths = table.querySelectorAll('thead th, thead td');
    return Array.from(ths).map((th, i) => ({
      index: i,
      text: th.textContent.trim(),
      title: th.getAttribute('title') || '',
    }));
  });

  // Also look for any links/buttons that act as filters
  const links = await page.evaluate(() => {
    // Look for links that modify the current URL
    const anchors = document.querySelectorAll('a[href*="trank.php"]');
    return Array.from(anchors).slice(0, 20).map(a => ({
      text: a.textContent.trim(),
      href: a.href,
    }));
  });

  console.log('\n=== DROPDOWN FILTERS ===');
  filters.forEach(f => {
    console.log(`\n  ${f.name}:`);
    f.options.forEach(o => {
      const sel = o.selected ? ' [SELECTED]' : '';
      console.log(`    value="${o.value}" -> "${o.text}"${sel}`);
    });
  });

  console.log('\n=== TABLE HEADERS ===');
  headers.forEach(h => {
    const title = h.title ? ` (title: "${h.title}")` : '';
    console.log(`  [${h.index}] "${h.text}"${title}`);
  });

  console.log('\n=== FILTER LINKS (first 20) ===');
  links.forEach(l => {
    console.log(`  "${l.text}" -> ${l.href}`);
  });

  return { filters, headers, links };
}

/**
 * Discover mode for the talent page: print headers + sample data
 */
async function discoverTalentPage(page, year) {
  const url = buildTalentUrl(year);
  console.log(`Discovering talent page for ${year}...`);
  console.log(`URL: ${url}`);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: PAGE_LOAD_TIMEOUT });
  await page.waitForSelector('table', { timeout: 15000 });

  // Scroll to load all rows
  let prevCount = 0;
  let curCount = 0;
  let scrollAttempt = 0;

  do {
    prevCount = curCount;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(SCROLL_WAIT_MS);
    curCount = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
    scrollAttempt++;
  } while (curCount > prevCount && scrollAttempt < MAX_SCROLL_ATTEMPTS);

  console.log(`Loaded ${curCount} rows after ${scrollAttempt} scrolls`);

  // Extract all select elements
  const filters = await page.evaluate(() => {
    const selects = document.querySelectorAll('select');
    const result = [];
    selects.forEach(sel => {
      const name = sel.name || sel.id || sel.className || '(unnamed)';
      const options = [];
      sel.querySelectorAll('option').forEach(opt => {
        options.push({
          value: opt.value,
          text: opt.textContent.trim(),
          selected: opt.selected,
        });
      });
      result.push({ name, options });
    });
    return result;
  });

  // Extract ALL thead rows to understand table structure
  const allTheadRows = await page.evaluate(() => {
    const table = document.querySelector('table');
    if (!table) return [];
    const rows = table.querySelectorAll('thead tr');
    return Array.from(rows).map((row, ri) => {
      const cells = row.querySelectorAll('th, td');
      return {
        rowIndex: ri,
        cells: Array.from(cells).map((cell, ci) => ({
          index: ci,
          text: cell.textContent.trim().substring(0, 60),
          title: cell.getAttribute('title') || '',
          colspan: cell.getAttribute('colspan') || '',
        })),
      };
    });
  });

  // Extract first 5 data rows for sample
  const sampleRows = await page.evaluate(() => {
    const table = document.querySelector('table');
    if (!table) return [];
    const rows = table.querySelectorAll('tbody tr');
    return Array.from(rows).slice(0, 5).map(row => {
      const cells = row.querySelectorAll('td');
      return Array.from(cells).map((cell, i) => {
        const link = cell.querySelector('a');
        const text = cell.textContent.trim().substring(0, 40);
        return { index: i, text, hasLink: !!link };
      });
    });
  });

  console.log('\n=== DROPDOWN FILTERS ===');
  filters.forEach(f => {
    console.log(`\n  ${f.name}:`);
    f.options.forEach(o => {
      const sel = o.selected ? ' [SELECTED]' : '';
      console.log(`    value="${o.value}" -> "${o.text}"${sel}`);
    });
  });

  console.log('\n=== ALL THEAD ROWS ===');
  allTheadRows.forEach(row => {
    console.log(`\n  Row ${row.rowIndex} (${row.cells.length} cells):`);
    row.cells.forEach(c => {
      const extra = [];
      if (c.title) extra.push(`title="${c.title}"`);
      if (c.colspan) extra.push(`colspan=${c.colspan}`);
      const suffix = extra.length ? ` (${extra.join(', ')})` : '';
      console.log(`    [${c.index}] "${c.text}"${suffix}`);
    });
  });

  console.log('\n=== SAMPLE DATA ROWS (first 5) ===');
  sampleRows.forEach((row, ri) => {
    console.log(`\n  Row ${ri}:`);
    row.forEach(c => {
      const link = c.hasLink ? ' [LINK]' : '';
      console.log(`    [${c.index}] "${c.text}"${link}`);
    });
  });
}

/**
 * Discover mode for Wikipedia region pages: print section headings, table structures,
 * and team names found in the bracket tables.
 */
async function discoverRegionFromWikipedia(page, year) {
  const url = `https://en.wikipedia.org/wiki/${year}_NCAA_Division_I_women%27s_basketball_tournament`;
  console.log(`Discovering Wikipedia region structure for ${year}...`);
  console.log(`URL: ${url}`);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: PAGE_LOAD_TIMEOUT });

  const data = await page.evaluate(() => {
    // Find all section headings (h2, h3, h4)
    const headings = [];
    document.querySelectorAll('h2, h3, h4').forEach(h => {
      const headline = h.querySelector('.mw-headline');
      const text = headline ? headline.textContent.trim() : h.textContent.trim();
      const id = headline ? headline.id : '';
      headings.push({ tag: h.tagName, text, id });
    });

    // Find all bracket tables — look for tables with class "bracket" or tables near region headings
    // Women's regions use varied naming: traditional (Albany, Portland, etc.) and
    // numbered city format (Spokane 1, Birmingham 2, etc.)
    const results = [];

    // Strategy: find h3 headings that contain region names, then look for tables after them
    const allElements = document.querySelectorAll('h2, h3, h4, table');
    let currentSection = '';
    let currentTag = '';

    allElements.forEach(el => {
      if (el.tagName.match(/^H[234]$/)) {
        const headline = el.querySelector('.mw-headline');
        const text = (headline ? headline.textContent : el.textContent).trim();
        currentSection = text;
        currentTag = el.tagName;
      } else if (el.tagName === 'TABLE') {
        // Extract team names from links in this table
        const links = el.querySelectorAll('a');
        const teams = [];
        const seenTeams = new Set();
        links.forEach(link => {
          const href = link.getAttribute('href') || '';
          const text = link.textContent.trim();
          // Filter for team links (Wikipedia team articles, not seed numbers or generic links)
          if (href.startsWith('/wiki/') &&
              !href.includes('NCAA') &&
              !href.includes('File:') &&
              !href.includes('Template:') &&
              !href.includes('#') &&
              text.length > 2 &&
              !/^\d+$/.test(text) &&
              !text.includes('seed') &&
              !seenTeams.has(text)) {
            seenTeams.add(text);
            teams.push(text);
          }
        });

        if (teams.length > 0) {
          results.push({
            section: currentSection,
            sectionTag: currentTag,
            tableClasses: el.className,
            teamCount: teams.length,
            teams: teams.slice(0, 20), // first 20 for display
            totalLinks: links.length,
          });
        }
      }
    });

    return { headings, results };
  });

  console.log('\n=== SECTION HEADINGS ===');
  data.headings.forEach(h => {
    console.log(`  ${h.tag}: "${h.text}" (id: ${h.id})`);
  });

  console.log('\n=== TABLES WITH TEAM LINKS (by section) ===');
  data.results.forEach((r, i) => {
    console.log(`\n  [${i}] Section: "${r.section}" (${r.sectionTag})`);
    console.log(`      Table classes: "${r.tableClasses}"`);
    console.log(`      Teams found: ${r.teamCount} (${r.totalLinks} total links)`);
    console.log(`      Teams: ${r.teams.join(', ')}`);
  });

  return data;
}

/**
 * Scrape region assignments from the Wikipedia women's tournament bracket page
 * for a given year.
 *
 * Women's regions use varied naming conventions:
 *   - Traditional city names: "Albany", "Portland", "Spokane", etc.
 *   - Numbered city format: "Spokane 1 Region", "Birmingham 2 Region"
 *   - Cardinal directions (some older years): "East", "West", etc.
 *
 * Returns Map<wikiTeamName, regionName> (raw Wikipedia names — caller resolves to Barttorvik).
 */
async function scrapeRegionFromWikipedia(page, year) {
  const url = `https://en.wikipedia.org/wiki/${year}_NCAA_Division_I_women%27s_basketball_tournament`;
  console.log(`\n  --- Region (Wikipedia) ---`);
  console.log(`    Navigating: ${url}`);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: PAGE_LOAD_TIMEOUT });

  const regionData = await page.evaluate(() => {
    // Women's regions can be:
    //   - Traditional: "East regional", "West regional", etc.
    //   - City-based: "Albany regional", "Portland regional", "Spokane regional"
    //   - Numbered city: "Spokane 1 regional", "Birmingham 2 regional"
    // We detect region headings by looking for h3 sections containing "regional"

    // --- Seed + region extraction from "Tournament seeds" tables ---
    // Structure: outer table with 2x2 grid of cells, each containing:
    //   - Region label text (e.g. "Albany Regional – Times Union Center,...")
    //   - An inner table with header row [Seed, School, Conference, Record, ...]
    //     and data rows. School cell may be <th> or <td>, with or without links.
    // We detect column positions from the header row for robustness across years.
    const seedMap = {};
    const seedRegionMap = {};  // teamName → region from seed table context

    function parseSeedTable(table, regionName) {
      const rows = table.querySelectorAll('tr');
      // Find header row to determine column indices
      let seedIdx = -1, schoolIdx = -1;
      for (const row of rows) {
        const cells = row.querySelectorAll('th, td');
        const texts = Array.from(cells).map(c => c.textContent.trim().toLowerCase());
        const si = texts.indexOf('seed');
        const sci = texts.indexOf('school');
        if (si !== -1 && sci !== -1) {
          seedIdx = si;
          schoolIdx = sci;
          break;
        }
      }
      if (seedIdx === -1 || schoolIdx === -1) return;

      // Parse data rows using discovered column indices
      for (const row of rows) {
        const cells = row.querySelectorAll('th, td');
        if (cells.length <= Math.max(seedIdx, schoolIdx)) continue;
        const seedText = cells[seedIdx].textContent.trim();
        const seedNum = parseInt(seedText, 10);
        if (isNaN(seedNum) || seedNum < 1 || seedNum > 16) continue;
        // School name: prefer link text, fall back to cell text
        const schoolCell = cells[schoolIdx];
        const link = schoolCell.querySelector('a');
        const teamName = link ? link.textContent.trim() : schoolCell.textContent.trim();
        if (teamName && teamName.length > 1) {
          seedMap[teamName] = String(seedNum);
          if (regionName) seedRegionMap[teamName] = regionName;
        }
      }
    }

    const seedHeading = Array.from(document.querySelectorAll('h3')).find(h => {
      const hl = h.querySelector('.mw-headline');
      return (hl ? hl.textContent : h.textContent).trim().toLowerCase().includes('tournament seeds');
    });
    if (seedHeading) {
      const wrapper = seedHeading.closest('.mw-heading') || seedHeading.parentElement;
      let el = wrapper.nextElementSibling;
      while (el) {
        if (el.tagName && el.tagName.match(/^H[23]$/)) break;
        if (el.classList && el.classList.contains('mw-heading')) break;
        if (el.tagName === 'TABLE') {
          // Each outer cell contains a region label + inner table
          const outerCells = el.querySelectorAll(':scope > tbody > tr > td, :scope > tr > td');
          for (const outerCell of outerCells) {
            // Extract region name from the cell's leading text
            const cellText = outerCell.textContent.trim();
            let regionName = '';
            const regionMatch = cellText.match(/^(.+?)\s*[Rr]egional/);
            if (regionMatch) {
              regionName = regionMatch[1].trim();
              // Check for numbered format: "Greenville Regional 1"
              const numMatch = cellText.match(/[Rr]egional\s+(\d+)/);
              if (numMatch) regionName += ' ' + numMatch[1];
            }

            const innerTable = outerCell.querySelector('table');
            if (innerTable) {
              parseSeedTable(innerTable, regionName);
            }
          }

          // Fallback: if no outer cells (flat table), parse the table directly
          if (outerCells.length === 0) {
            parseSeedTable(el, '');
          }
        }
        el = el.nextElementSibling;
      }
    }

    // Helper: extract team names from link texts in a table.
    // If teamOnly=true, filter to links whose href contains a season year
    // (e.g. /wiki/2020...), which excludes venue/city links.
    function extractTeamLinks(table, teamOnly) {
      const links = table.querySelectorAll('a');
      const teams = [];
      const seen = new Set();
      links.forEach(link => {
        const name = link.textContent.trim();
        if (!name || name.length <= 1 || /^\d+$/.test(name) || seen.has(name)) return;
        if (teamOnly) {
          const href = link.getAttribute('href') || '';
          if (!/\/wiki\/\d{4}/.test(href)) return;
        }
        seen.add(name);
        teams.push(name);
      });
      return teams;
    }

    // Helper: find TABLEs after a heading's wrapper div.
    // Checks both direct siblings and tables nested inside sibling DIVs.
    function findNextTables(h) {
      const wrapper = h.closest('.mw-heading') || h.parentElement;
      let el = wrapper.nextElementSibling;
      const tables = [];
      while (el) {
        if (el.tagName === 'TABLE') {
          tables.push(el);
        } else if (el.tagName === 'DIV' || el.tagName === 'SECTION') {
          // Look for tables nested inside this element
          el.querySelectorAll('table').forEach(t => tables.push(t));
        }
        if (el.tagName && el.tagName.match(/^H[23]$/)) break;
        if (el.classList && el.classList.contains('mw-heading')) break;
        el = el.nextElementSibling;
      }
      return tables;
    }

    // Helper: extract a region name from a heading text.
    // Women's tournament headings use varied formats:
    //   2022: "Greensboro regional – Greensboro, North Carolina"  → "Greensboro"
    //   2023: "Greenville Regional 1 – Bon Secours..."           → "Greenville 1"
    //   2024: "Albany regional 1 – Albany, NY"                    → "Albany 1"
    //   2025: "Spokane regional 1 – Spokane, WA"                 → "Spokane 1"
    // The number (when present) comes AFTER "regional" and distinguishes
    // regions hosted in the same city.
    function extractRegionName(headingText) {
      const lower = headingText.toLowerCase().trim();
      // Must contain "regional" or "region"
      if (!lower.includes('regional') && !lower.includes('region')) return null;

      // Try: "City regional N – ..." or "City Regional N – ..."
      const matchWithNum = headingText.match(/^(.+?)\s*[Rr]egional\s+(\d+)/);
      if (matchWithNum) {
        return matchWithNum[1].trim() + ' ' + matchWithNum[2];
      }

      // Try: "City regional – ..." (no number)
      const matchNoNum = headingText.match(/^(.+?)\s*(?:regional|region)/i);
      if (matchNoNum) {
        return matchNoNum[1].trim();
      }

      return null;
    }

    const results = [];
    const firstFourPairs = []; // Array of [team1, team2] from First Four matchups

    const headings = document.querySelectorAll('h3');

    for (const h3 of headings) {
      const headline = h3.querySelector('.mw-headline');
      const text = (headline ? headline.textContent : h3.textContent).trim();
      const lower = text.toLowerCase();

      // Parse regional bracket tables
      const regionName = extractRegionName(text);
      if (regionName) {
        const tables = findNextTables(h3);
        if (tables.length === 0) continue;
        const teams = extractTeamLinks(tables[0]);
        results.push({ region: regionName, teams });
        continue;
      }

      // Parse First Four / Opening Round tables
      if (lower.includes('first four') || lower.includes('opening round') || lower.includes('first round')) {
        // Only match actual First Four sections, not "First round" game sections
        if (lower === 'first round') continue;
        const tables = findNextTables(h3);
        // Each table is a 2-team matchup — use teamOnly to skip venue/city links
        for (const table of tables) {
          const teams = extractTeamLinks(table, true);
          if (teams.length >= 2) {
            firstFourPairs.push(teams.slice(0, 2));
          }
        }
      }
    }

    // --- Bracket wins: count bold (winner) appearances per team ---
    // Wikipedia's Module:Team bracket renders winners with CSS font-weight:bold
    // on the cell (NOT <b> tags). Each bold team-name cell = one tournament win.
    // Team names appear once per round played; later rounds use plain text (no link).
    const winsCount = {};
    const processedTables = new Set(); // avoid double-counting

    // Gather all bracket tables that follow region / Final Four / First Four headings.
    // Modern pages (2022+) use H3 section headings with CSS font-weight:bold.
    // Older pages (2015-2019) nest bracket tables under H4 sub-headings with <b> tags,
    // and the Final Four bracket is under an H2 "Final Four" section.
    const bracketHeadings = document.querySelectorAll('h2, h3, h4');
    for (const heading of bracketHeadings) {
      const hl = heading.querySelector('.mw-headline');
      const hText = (hl ? hl.textContent : heading.textContent).trim().toLowerCase();
      const isRelevant =
        // Match "regional" but NOT "subregionals" (seed listing heading)
        ((hText.includes('regional') || hText.includes('region')) && !hText.includes('subregional')) ||
        hText.includes('final four') || hText.includes('finals') ||
        hText.includes('first four') || hText.includes('opening round') ||
        hText.includes('championship') ||
        // H4 "Bracket" sub-headings in older pages
        (heading.tagName === 'H4' && hText === 'bracket');
      if (!isRelevant) continue;

      // Walk sibling elements to find bracket tables
      const wrapper = heading.closest('.mw-heading') || heading.parentElement;
      let el = wrapper.nextElementSibling;
      while (el) {
        // Stop at same-level or higher section boundaries
        const hTag = heading.tagName; // H2, H3, or H4
        if (el.tagName === 'H2') break;
        if (el.tagName === 'H3' && hTag !== 'H2') break;
        if (el.tagName === 'H4' && hTag === 'H4') break;
        // Stop at .mw-heading wrappers at the same or higher level
        if (el.classList && el.classList.contains('mw-heading')) {
          if (el.querySelector('h2')) break;
          if (el.querySelector('h3') && hTag !== 'H2') break;
          if (el.querySelector('h4') && hTag === 'H4') break;
        }

        const tables = el.tagName === 'TABLE' ? [el] : Array.from(el.querySelectorAll('table'));

        for (const table of tables) {
          if (processedTables.has(table)) continue;
          processedTables.add(table);
          // Skip small tables — bracket tables have 11+ rows (Final Four=11, regional=47).
          // Game summary, attendance, and scoring tables have only 1-5 rows.
          if (table.querySelectorAll('tr').length < 10) continue;
          // Detect bold team names via two methods:
          //   A) CSS font-weight:bold on the cell (2022+ Wikipedia bracket template)
          //   B) <b> tag inside the cell (2015-2019 older bracket template)
          let boldCount = 0;
          const rows = table.querySelectorAll('tr');
          for (const row of rows) {
            const cells = row.querySelectorAll('td, th');
            for (const cell of cells) {
              // Method A: CSS bold on cell
              const weight = window.getComputedStyle(cell).fontWeight;
              const isCssBold = weight === 'bold' || parseInt(weight) >= 700;
              // Method B: <b> tag inside cell
              const bTag = cell.querySelector('b');
              if (!isCssBold && !bTag) continue;

              // Use <b> tag text when available (more precise), else cell text
              const text = (bTag ? bTag.textContent : cell.textContent).trim();
              // Skip empty, numeric-only (seeds/scores), or very long text (labels)
              if (!text || text.length <= 1 || /^\d+$/.test(text) || text.length > 40) continue;
              // Skip cells containing commas (venue names like "Los Angeles, California")
              if (text.includes(',')) continue;
              // Skip cells with line breaks (round labels like "First round\nRound of 64")
              if (text.includes('\n')) continue;
              // Skip cells with dashes likely indicating date ranges
              if (/\d+\s*[–-]\s*\d+/.test(text) && text.length > 5) continue;
              winsCount[text] = (winsCount[text] || 0) + 1;
              boldCount++;
            }
          }

          // Strategy 2 (fallback): if no bold detected in this table,
          // pair consecutive team rows and compare scores
          if (boldCount === 0) {
            const teamRows = [];
            for (const row of rows) {
              const cells = row.querySelectorAll('td, th');
              let teamName = null;
              let score = null;
              for (const cell of cells) {
                const link = cell.querySelector('a');
                if (link) {
                  const href = link.getAttribute('href') || '';
                  if (href.startsWith('/wiki/') && !href.includes('NCAA') && !href.includes('File:')) {
                    const n = link.textContent.trim();
                    if (n && n.length > 1 && !/^\d+$/.test(n)) {
                      teamName = n;
                    }
                  }
                }
                const cellText = cell.textContent.trim();
                if (/^\d{1,3}$/.test(cellText)) {
                  score = parseInt(cellText, 10);
                }
              }
              if (teamName && score !== null) {
                teamRows.push({ teamName, score });
              }
            }
            for (let i = 0; i + 1 < teamRows.length; i += 2) {
              const a = teamRows[i];
              const b = teamRows[i + 1];
              if (a.score > b.score) {
                winsCount[a.teamName] = (winsCount[a.teamName] || 0) + 1;
              } else if (b.score > a.score) {
                winsCount[b.teamName] = (winsCount[b.teamName] || 0) + 1;
              }
            }
          }
        }

        el = el.nextElementSibling;
      }
    }

    return { results, firstFourPairs, seedMap, seedRegionMap, winsCount };
  });

  // Build seed map (Wikipedia team name → seed string)
  const wikiSeedMap = new Map();
  for (const [teamName, seed] of Object.entries(regionData.seedMap || {})) {
    wikiSeedMap.set(teamName, seed);
  }
  if (wikiSeedMap.size > 0) {
    console.log(`    Seeds: ${wikiSeedMap.size} teams from seed tables`);
  }

  // Build region map from seed table context (fallback for pre-2022 years where
  // bracket tables don't have team links)
  const seedRegionMap = new Map();
  for (const [teamName, region] of Object.entries(regionData.seedRegionMap || {})) {
    seedRegionMap.set(teamName, region);
  }
  if (seedRegionMap.size > 0) {
    console.log(`    Seed-table regions: ${seedRegionMap.size} teams`);
  }

  // Build the region map from bracket tables
  const regionMap = new Map();
  for (const { region, teams } of regionData.results) {
    console.log(`    ${region}: ${teams.length} entries`);
    for (const team of teams) {
      regionMap.set(team, region);
    }
  }

  // Handle First Four: for each pair, if one team already has a region from the
  // bracket, assign the other team to the same region (First Four loser gets
  // the region of the winner who advanced into the bracket)
  //
  // First Four tables sometimes use different name variants than bracket tables
  // (e.g., "UNC-Asheville" vs "UNC Asheville"), so we do fuzzy lookup.
  function lookupRegion(name) {
    if (regionMap.has(name)) return regionMap.get(name);
    // Try hyphen <-> space variants
    const alt = name.includes('-') ? name.replace(/-/g, ' ') : name.replace(/ /g, '-');
    if (regionMap.has(alt)) return regionMap.get(alt);
    return undefined;
  }

  if (regionData.firstFourPairs.length > 0) {
    console.log(`    First Four: ${regionData.firstFourPairs.length} matchups`);
    for (const pair of regionData.firstFourPairs) {
      const [a, b] = pair;
      const regionA = lookupRegion(a);
      const regionB = lookupRegion(b);
      if (regionA && !regionB) {
        regionMap.set(b, regionA);
      } else if (regionB && !regionA) {
        regionMap.set(a, regionB);
      }
    }
  }

  // Merge seed-table regions as fallback (for years where bracket tables lack team links)
  for (const [teamName, region] of seedRegionMap) {
    if (!regionMap.has(teamName)) {
      regionMap.set(teamName, region);
    }
  }

  // Build wins map from evaluate result
  const winsMap = new Map();
  for (const [teamName, wins] of Object.entries(regionData.winsCount || {})) {
    winsMap.set(teamName, wins);
  }
  console.log(`    Bracket wins: ${winsMap.size} teams with wins`);

  console.log(`    Total entries: ${regionMap.size}`);
  return { regionMap, seedMap: wikiSeedMap, winsMap };
}

/**
 * Scrape talent data from ncaaw/team-tables_each.php for a given year.
 * Returns Map<teamName, { talent, talent_rk }> where talent is the raw score
 * and talent_rk is the rank (row position in the table, which is sorted by talent).
 *
 * Note: The women's talent page may not exist — this function handles that gracefully.
 */
async function scrapeTalentPage(page, year) {
  const url = buildTalentUrl(year);
  console.log(`\n  --- Talent (ncaaw/team-tables_each.php) ---`);
  console.log(`    Navigating: ${url}`);

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: PAGE_LOAD_TIMEOUT });
  } catch (err) {
    console.log(`    Talent page not available for women (${err.message}) — skipping`);
    return new Map();
  }

  // Check if the page actually has a table (graceful fallback if page exists but has no data)
  const hasTable = await page.evaluate(() => !!document.querySelector('table'));
  if (!hasTable) {
    console.log('    Talent page loaded but contains no table — skipping');
    return new Map();
  }

  await page.waitForSelector('table', { timeout: 15000 });

  // Scroll to load all rows
  let prevCount = 0;
  let curCount = 0;
  let scrollAttempt = 0;
  do {
    prevCount = curCount;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(SCROLL_WAIT_MS);
    curCount = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
    scrollAttempt++;
  } while (curCount > prevCount && scrollAttempt < MAX_SCROLL_ATTEMPTS);

  console.log(`    Loaded ${curCount} rows after ${scrollAttempt} scrolls`);

  const result = await page.evaluate(() => {
    const tables = Array.from(document.querySelectorAll('table'));
    let table = tables[0];
    for (const t of tables) {
      if (t.querySelectorAll('tbody tr').length > (table ? table.querySelectorAll('tbody tr').length : 0)) {
        table = t;
      }
    }
    if (!table) return { teams: [] };

    // Find header row — look for the thead row with "Team" and a talent-like column
    const theadRows = table.querySelectorAll('thead tr');
    let headerRow = null;
    for (const row of theadRows) {
      const cells = row.querySelectorAll('th, td');
      const texts = Array.from(cells).map(c => c.textContent.trim().toLowerCase());
      if (texts.some(t => t === 'team') && texts.some(t => t.includes('tal'))) {
        headerRow = row;
        break;
      }
    }
    // Fallback: last thead row
    if (!headerRow && theadRows.length > 0) {
      headerRow = theadRows[theadRows.length - 1];
    }

    if (!headerRow) return { teams: [], headers: [] };

    // Parse headers
    const headers = [];
    headerRow.querySelectorAll('th, td').forEach(cell => {
      let text = (cell.textContent || '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      // Strip trailing numbers that are averages merged into header text
      const match = text.match(/^([A-Za-z%.\s]+?)(\d)/);
      if (match && match[1].trim().length >= 2) {
        text = match[1].trim();
      }
      headers.push(text);
    });

    // Find team column index and talent column index
    const teamIdx = headers.findIndex(h => h.toLowerCase() === 'team');
    const talentIdx = headers.findIndex(h => h.toLowerCase().includes('tal'));

    if (teamIdx === -1 || talentIdx === -1) {
      return { teams: [], headers, teamIdx, talentIdx };
    }

    // Extract data
    const teams = [];
    const bodyRows = table.querySelectorAll('tbody tr');
    bodyRows.forEach((row, rowIndex) => {
      const cells = row.querySelectorAll('td');
      if (cells.length <= Math.max(teamIdx, talentIdx)) return;

      // Team name: extract from link
      const teamCell = cells[teamIdx];
      const link = teamCell.querySelector('a[href*="team.php"]');
      const teamName = link
        ? (link.childNodes[0]?.textContent?.trim() || '')
        : teamCell.textContent.trim();
      if (!teamName) return;

      // Talent value: may have a lowrow rank span, but typically a plain number
      const talentCell = cells[talentIdx];
      const lowrow = talentCell.querySelector('.lowrow, span[style*="font-size:8px"]');
      let talentScore = '';
      let talentRank = '';
      if (lowrow) {
        talentScore = talentCell.childNodes[0]?.textContent?.trim() || '';
        talentRank = lowrow.textContent.trim();
      } else {
        talentScore = talentCell.textContent.trim();
      }

      teams.push({ teamName, talentScore, talentRank });
    });

    return { teams, headers, teamIdx, talentIdx };
  });

  // If ranks weren't embedded in cells, compute from scores (higher = better)
  const teams = result.teams;
  const needsRank = teams.length > 0 && !teams[0].talentRank;
  if (needsRank) {
    const sorted = [...teams]
      .filter(t => t.talentScore && !isNaN(parseFloat(t.talentScore)))
      .sort((a, b) => parseFloat(b.talentScore) - parseFloat(a.talentScore));
    sorted.forEach((t, i) => { t.talentRank = String(i + 1); });
  }

  // Build map
  const talentMap = new Map();
  for (const { teamName, talentScore, talentRank } of teams) {
    talentMap.set(teamName, { talent: talentScore, talent_rk: talentRank });
  }

  console.log(`    Got talent data for ${talentMap.size} teams (column: headers[${result.talentIdx}])`);
  if (result.headers) {
    console.log(`    Headers: ${result.headers.join(', ')}`);
  }

  return talentMap;
}

/**
 * Scrape all 3 splits for a single year.
 * Returns array of merged team rows for that year.
 */
async function scrapeYear(page, year, splitsToRun) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  SCRAPING YEAR ${year} (WOMEN)`);
  console.log(`${'='.repeat(60)}`);

  const useNcaaFilter = year >= TORVIK_NCAA_FILTER_START;

  // For pre-2022 years, scrape Wikipedia FIRST so we know which teams made the tournament
  let regionMap = new Map();
  let wikiSeedMap = new Map();
  let winsMap = new Map();
  let tournamentTeams = null; // null = no filtering needed (Torvik handles it)

  if (!useNcaaFilter) {
    console.log(`\n  (Pre-${TORVIK_NCAA_FILTER_START}: scraping Wikipedia first for tournament team list)`);
    try {
      const wikiData = await scrapeRegionFromWikipedia(page, year);
      regionMap = wikiData.regionMap;
      wikiSeedMap = wikiData.seedMap;
      winsMap = wikiData.winsMap;

      // Build tournament team list from Wikipedia seed tables (most reliable)
      // Fall back to region map entries if seed table is sparse
      tournamentTeams = new Set();
      for (const [wikiName] of wikiSeedMap) {
        tournamentTeams.add(wikiName);
      }
      // Also add teams from region brackets that might not be in seed table
      for (const [wikiName] of regionMap) {
        tournamentTeams.add(wikiName);
      }
      console.log(`    Tournament team list: ${tournamentTeams.size} entries from Wikipedia`);
    } catch (err) {
      console.error(`    ERROR scraping Wikipedia for ${year}:`, err.message);
      console.log(`    Cannot determine tournament teams — skipping year`);
      return [];
    }
    await sleep(DELAY_BETWEEN_PAGES_MS);
  }

  const splitData = {};

  // Pre-2022: Torvik ignores the year param for women's data, so stats are bogus.
  // Scrape only one page to get team names + conferences for matching.
  const splitsToScrape = useNcaaFilter ? splitsToRun : { reg: SPLITS.reg };

  for (const [key, split] of Object.entries(splitsToScrape)) {
    console.log(`\n  --- ${split.label} (prefix: ${split.prefix}) ---`);
    const url = buildUrl(year, split.params, { useNcaaFilter });

    try {
      const { headers, rows } = await scrapePage(page, url);

      if (rows.length === 0) {
        console.log(`    WARNING: No rows returned for ${split.label} ${year}`);
      } else {
        console.log(`    Got ${rows.length} teams, ${headers.length} columns`);
        console.log(`    Headers: ${headers.join(', ')}`);
      }

      splitData[key] = { headers, rows, prefix: split.prefix };
    } catch (err) {
      console.error(`    ERROR scraping ${split.label} ${year}:`, err.message);
      splitData[key] = { headers: [], rows: [], prefix: split.prefix };
    }

    // Rate limit between page loads
    await sleep(DELAY_BETWEEN_PAGES_MS);
  }

  if (!useNcaaFilter) {
    console.log(`\n  (Skipped nc/q12 splits — Torvik has no historical women's data pre-${TORVIK_NCAA_FILTER_START})`);
  }

  // No talent/recruiting data available for women's on Torvik — skip
  const talentMap = new Map();

  // For 2022+, scrape Wikipedia after Torvik (same as before)
  if (useNcaaFilter) {
    try {
      const wikiData = await scrapeRegionFromWikipedia(page, year);
      regionMap = wikiData.regionMap;
      wikiSeedMap = wikiData.seedMap;
      winsMap = wikiData.winsMap;
    } catch (err) {
      console.error(`    ERROR scraping region for ${year}:`, err.message);
    }
    await sleep(DELAY_BETWEEN_PAGES_MS);
  }

  // Merge splits by team name
  return mergeYearData(year, splitData, talentMap, regionMap, wikiSeedMap, tournamentTeams, winsMap);
}

/**
 * Merge multiple splits into one row per team.
 * Each stat column gets prefixed with the split prefix (reg_, nc_, q12_).
 * Talent data is added as unprefixed columns (talent, talent_rk).
 * Region data is matched from Wikipedia names to Barttorvik names.
 *
 * @param {number} year
 * @param {Object} splitData
 * @param {Map} talentMap
 * @param {Map} regionMap - Map<wikiTeamName, regionName>
 * @param {Map} wikiSeedMap - Map<wikiTeamName, seedString> from Wikipedia seed tables
 * @param {Set|null} tournamentTeams - If non-null, only include teams whose Wikipedia
 *        name appears in this set (used for pre-2022 years where Torvik returns all teams).
 * @param {Map} winsMap - Map<wikiTeamName, numberOfWins> from bracket bold-counting
 */
function mergeYearData(year, splitData, talentMap = new Map(), regionMap = new Map(), wikiSeedMap = new Map(), tournamentTeams = null, winsMap = new Map()) {
  // Use the regular season split as the base (it has all tournament teams)
  const baseSplit = splitData.reg || Object.values(splitData)[0];
  if (!baseSplit || baseSplit.rows.length === 0) {
    console.log(`  No base data for ${year}, skipping merge`);
    return [];
  }

  // Find the team column name (case-insensitive)
  const findCol = (headers, name) => headers.find(h => h.toLowerCase() === name.toLowerCase());
  const teamCol = findCol(baseSplit.headers, 'team') || 'Team';

  // If we need to filter to tournament teams, build a Torvik name → wiki name lookup
  // so we know which Torvik teams to keep and can attach seeds/regions.
  let torvikToWiki = null;
  if (tournamentTeams) {
    const allTorvikNames = new Set(baseSplit.rows.map(r => r[teamCol]).filter(Boolean));
    torvikToWiki = new Map();

    for (const wikiName of tournamentTeams) {
      const torvikName = matchWikiTeamName(wikiName, allTorvikNames);
      if (torvikName) {
        torvikToWiki.set(torvikName, wikiName);
      }
      // Also try the name as-is (some names match directly)
      if (allTorvikNames.has(wikiName) && !torvikToWiki.has(wikiName)) {
        torvikToWiki.set(wikiName, wikiName);
      }
    }
    console.log(`  Tournament filter: matched ${torvikToWiki.size} Torvik teams from ${tournamentTeams.size} Wikipedia entries`);
  }

  // Build a map of team -> merged row
  const merged = new Map();

  // Initialize from base split with common (non-prefixed) columns
  for (const row of baseSplit.rows) {
    const team = row[teamCol];
    if (!team) continue;

    // Filter to tournament teams only (pre-2022)
    if (torvikToWiki && !torvikToWiki.has(team)) continue;

    merged.set(team, {
      year: String(year),
      team: team,
      conf: row[findCol(baseSplit.headers, 'conf')] || '',
      region: '',
      seed: row['_seed'] || '',
    });
  }

  // Columns to skip when prefixing (they're in the common section or are noise)
  const skipCols = new Set(['team', 'conf', 'region', '_seed', 'year', '']);

  // Add each split's data with prefix — but skip for pre-2022 years where
  // Torvik returns bogus frozen data (year param is ignored for women's).
  if (year >= TORVIK_NCAA_FILTER_START) {
    for (const [, { headers, rows, prefix }] of Object.entries(splitData)) {
      // Build a lookup by team name
      const rowsByTeam = new Map();
      for (const row of rows) {
        const team = row[teamCol];
        if (team) rowsByTeam.set(team, row);
      }

      // For each team in our merged set, add prefixed columns
      for (const [team, mergedRow] of merged) {
        const splitRow = rowsByTeam.get(team);
        if (!splitRow) continue;

        for (const header of headers) {
          if (skipCols.has(header.toLowerCase())) continue;

          const colName = `${prefix}_${sanitizeHeader(header)}`;
          mergedRow[colName] = splitRow[header] || '';
        }
      }
    }
  } else {
    console.log(`  (Skipping Torvik stat columns — no valid data pre-${TORVIK_NCAA_FILTER_START})`);
  }

  // Merge talent data (unprefixed columns)
  let talentMatches = 0;
  for (const [team, mergedRow] of merged) {
    const talent = talentMap.get(team);
    if (talent) {
      mergedRow.talent = talent.talent;
      mergedRow.talent_rk = talent.talent_rk;
      talentMatches++;
    }
  }
  if (talentMap.size > 0) {
    console.log(`  Talent: matched ${talentMatches}/${merged.size} teams`);
  }

  // Merge region + seed data from Wikipedia
  if (regionMap.size > 0 || wikiSeedMap.size > 0) {
    const torvikNames = new Set(merged.keys());
    let regionMatches = 0;
    let seedMatches = 0;
    const unmatchedWiki = [];

    // Helper: resolve a Wikipedia name to a Torvik name in our merged set
    const resolveToTorvik = (wikiName) => {
      const torvikName = matchWikiTeamName(wikiName, torvikNames);
      return torvikName; // string, null (known non-team), or undefined (mismatch)
    };

    // Apply regions
    for (const [wikiName, region] of regionMap) {
      const torvikName = resolveToTorvik(wikiName);
      if (torvikName) {
        const row = merged.get(torvikName);
        if (row && !row.region) {
          row.region = region;
          regionMatches++;
        }
      } else if (torvikName !== null) {
        unmatchedWiki.push(wikiName);
      }
    }

    // Apply seeds from Wikipedia (fills in seeds for pre-2022 years where
    // Torvik doesn't embed them, and patches any gaps in 2022+ data)
    for (const [wikiName, seed] of wikiSeedMap) {
      const torvikName = resolveToTorvik(wikiName);
      if (torvikName) {
        const row = merged.get(torvikName);
        if (row && !row.seed) {
          row.seed = seed;
          seedMatches++;
        }
      }
    }

    // Check for Barttorvik teams with no region assigned
    const missingRegion = [];
    for (const [team, row] of merged) {
      if (!row.region) missingRegion.push(team);
    }

    console.log(`  Region: matched ${regionMatches}/${merged.size} teams`);
    if (seedMatches > 0) {
      console.log(`  Seeds (from Wikipedia): filled ${seedMatches} teams`);
    }
    if (unmatchedWiki.length > 0) {
      console.log(`  Region unmatched Wikipedia names: ${unmatchedWiki.join(', ')}`);
    }
    if (missingRegion.length > 0) {
      console.log(`  Region missing for Barttorvik teams: ${missingRegion.join(', ')}`);
    }
  }

  // Merge tournament wins from bracket bold-counting
  if (winsMap.size > 0) {
    const torvikNames = new Set(merged.keys());
    let winsMatches = 0;
    for (const [wikiName, wins] of winsMap) {
      const torvikName = matchWikiTeamName(wikiName, torvikNames);
      if (torvikName) {
        const row = merged.get(torvikName);
        if (row) {
          row.tourney_wins = String(wins);
          winsMatches++;
        }
      }
    }
    console.log(`  Tourney wins: matched ${winsMatches}/${merged.size} teams`);
  }

  // Default tourney_wins to '0' for teams with no wins entry
  for (const [, row] of merged) {
    if (!row.tourney_wins) row.tourney_wins = '0';
  }

  const result = Array.from(merged.values());
  console.log(`  Merged ${result.length} teams for ${year}`);
  return result;
}

// ---------------------------------------------------------------------------
// CSV output
// ---------------------------------------------------------------------------

function writeCSV(allRows, outputPath) {
  if (allRows.length === 0) {
    console.log('No data to write.');
    return;
  }

  // Collect all unique column names across all rows, preserving a sensible order
  const fixedCols = ['year', 'team', 'conf', 'region', 'seed', 'tourney_wins', 'talent', 'talent_rk'];
  const dynamicCols = new Set();
  for (const row of allRows) {
    for (const key of Object.keys(row)) {
      if (!fixedCols.includes(key)) dynamicCols.add(key);
    }
  }

  // Sort dynamic columns: group by prefix (reg_, nc_, q12_), then alphabetically
  const sortedDynamic = Array.from(dynamicCols).sort((a, b) => {
    const prefixOrder = { reg: 0, nc: 1, q12: 2 };
    const [aPre] = a.split('_');
    const [bPre] = b.split('_');
    const aOrder = prefixOrder[aPre] ?? 3;
    const bOrder = prefixOrder[bPre] ?? 3;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.localeCompare(b);
  });

  const allCols = [...fixedCols, ...sortedDynamic];

  // Write header
  const lines = [allCols.join(',')];

  // Write rows
  for (const row of allRows) {
    const values = allCols.map(col => {
      const val = row[col] ?? '';
      // Escape commas and quotes in CSV
      if (String(val).includes(',') || String(val).includes('"') || String(val).includes('\n')) {
        return `"${String(val).replace(/"/g, '""')}"`;
      }
      return String(val);
    });
    lines.push(values.join(','));
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, lines.join('\n'), 'utf8');
  console.log(`\nWrote ${allRows.length} rows x ${allCols.length} columns to ${outputPath}`);
}

/**
 * Write all rows to CSV at once, using a unified column set across all years.
 */
function writeAllRowsToCSV(allRows, outputPath) {
  if (allRows.length === 0) return;

  // Collect the union of all column names across every row
  const fixedCols = ['year', 'team', 'conf', 'region', 'seed', 'tourney_wins', 'talent', 'talent_rk'];
  const dynamicCols = new Set();
  for (const row of allRows) {
    for (const key of Object.keys(row)) {
      if (!fixedCols.includes(key)) dynamicCols.add(key);
    }
  }

  const sortedDynamic = Array.from(dynamicCols).sort((a, b) => {
    const prefixOrder = { reg: 0, nc: 1, q12: 2 };
    const [aPre] = a.split('_');
    const [bPre] = b.split('_');
    const aOrder = prefixOrder[aPre] ?? 3;
    const bOrder = prefixOrder[bPre] ?? 3;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.localeCompare(b);
  });

  const allCols = [...fixedCols, ...sortedDynamic];

  // Columns whose W-L values (e.g. "9-20") Excel would misinterpret as dates
  const recCols = new Set(allCols.filter(c => /_Rec$/.test(c)));

  const lines = [allCols.join(',')];

  for (const row of allRows) {
    const values = allCols.map(col => {
      const val = row[col] ?? '';
      const s = String(val);
      // Wrap W-L record values so Excel doesn't convert "9-20" to a date
      if (recCols.has(col) && s && /^\d{1,2}-\d{1,2}$/.test(s)) {
        return `="${s}"`;
      }
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    });
    lines.push(values.join(','));
  }

  fs.writeFileSync(outputPath, lines.join('\n') + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs();

  console.log('========================================');
  console.log("  Torvik Women's Tournament Dataset Builder");
  console.log('========================================');
  console.log(`  Years: ${opts.startYear} - ${opts.endYear}`);
  console.log(`  Output: ${OUTPUT_FILE}`);
  if (opts.test) console.log('  MODE: TEST (single year, reg split only)');
  if (opts.discover) console.log(`  MODE: DISCOVER (year ${opts.discover})`);
  if (opts.discoverTalent) console.log(`  MODE: DISCOVER-TALENT (year ${opts.discoverTalent})`);
  if (opts.discoverRegion) console.log(`  MODE: DISCOVER-REGION (year ${opts.discoverRegion})`);
  if (opts.resume) console.log('  MODE: RESUME from last progress');
  console.log('');

  // Launch browser once, reuse for all pages
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Discover mode
    if (opts.discover) {
      await discoverFilters(page, opts.discover);
      await browser.close();
      return;
    }

    // Discover talent mode
    if (opts.discoverTalent) {
      await discoverTalentPage(page, opts.discoverTalent);
      await browser.close();
      return;
    }

    // Discover region mode
    if (opts.discoverRegion) {
      await discoverRegionFromWikipedia(page, opts.discoverRegion);
      await browser.close();
      return;
    }

    // Determine which splits to run
    let splitsToRun = SPLITS;
    if (opts.test) {
      // Test mode: only regular season
      splitsToRun = { reg: SPLITS.reg };
    }

    // Years to skip: 2020 (no tournament — COVID), 2021 (bubble season)
    const SKIP_YEARS = new Set([2020, 2021]);

    // Resume support
    const progress = opts.resume ? loadProgress() : { completedYears: [] };
    const years = [];
    for (let y = opts.startYear; y <= opts.endYear; y++) {
      if (SKIP_YEARS.has(y)) {
        console.log(`  Skipping ${y} (excluded)`);
        continue;
      }
      if (opts.resume && progress.completedYears.includes(y)) {
        console.log(`  Skipping ${y} (already completed)`);
        continue;
      }
      years.push(y);
    }

    if (years.length === 0) {
      console.log('No years to scrape. All done!');
      await browser.close();
      return;
    }

    const totalPages = years.length * (Object.keys(splitsToRun).length + 1); // +1 Wikipedia region (no talent page for women's)
    console.log(`  ${years.length} years x (${Object.keys(splitsToRun).length} splits + region) = ${totalPages} page loads`);
    console.log(`  Estimated time: ~${Math.ceil(totalPages * (DELAY_BETWEEN_PAGES_MS + 12000) / 60000)} minutes`);
    console.log('');

    // Scrape year by year
    const allRows = [];

    for (const year of years) {
      const yearRows = await scrapeYear(page, year, splitsToRun);

      if (yearRows.length > 0) {
        allRows.push(...yearRows);
      }

      // Track progress
      progress.completedYears.push(year);
      saveProgress(progress);
    }

    // Write all rows at once with a unified column set across all years
    writeAllRowsToCSV(allRows, OUTPUT_FILE);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`  COMPLETE: ${allRows.length} total team-year rows`);
    console.log(`  Output: ${OUTPUT_FILE}`);
    console.log(`${'='.repeat(60)}`);

  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
