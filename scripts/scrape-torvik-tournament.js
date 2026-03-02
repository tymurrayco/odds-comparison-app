#!/usr/bin/env node

/**
 * Torvik NCAA Tournament Dataset Builder
 *
 * Scrapes barttorvik.com/trank.php to build a comprehensive dataset of NCAA
 * tournament team stats across 20 years and 3 game-type splits.
 *
 * Output: data/torvik-tournament-dataset.csv
 *
 * Usage:
 *   node scripts/scrape-torvik-tournament.js                  # Full scrape 2008-2025
 *   node scripts/scrape-torvik-tournament.js --start 2020     # Start from 2020
 *   node scripts/scrape-torvik-tournament.js --year 2025      # Single year only
 *   node scripts/scrape-torvik-tournament.js --test           # Test mode: 2025, one split
 *   node scripts/scrape-torvik-tournament.js --discover 2025  # Print filter options for a year
 *   node scripts/scrape-torvik-tournament.js --discover-talent 2025  # Discover talent page structure
 *   node scripts/scrape-torvik-tournament.js --discover-region 2025 # Discover Wikipedia region structure
 *   node scripts/scrape-torvik-tournament.js --resume         # Resume from last completed year
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
const OUTPUT_FILE            = path.join(DATA_DIR, 'torvik-tournament-dataset.csv');
const PROGRESS_FILE          = path.join(DATA_DIR, '.torvik-scrape-progress.json');

// Torvik data starts at 2008; NCAA tournament has 64-68 teams depending on year
const DEFAULT_START_YEAR = 2008;
const DEFAULT_END_YEAR   = 2025;

// URL filter definitions — discovered via --discover mode on the actual page.
//
// trank.php params:
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

function buildUrl(year, extraParams = {}) {
  const base = 'https://barttorvik.com/trank.php';
  const params = new URLSearchParams({
    year: String(year),
    conlimit: 'NCAA',
    ...extraParams,
  });
  return `${base}?${params.toString()}`;
}

function buildTalentUrl(year) {
  const base = 'https://barttorvik.com/team-tables_each.php';
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

  // Older name variants that may appear in pre-2015 pages
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

  // 2021 venue names (all games in Indiana, venue names appear instead of city names)
  'Bankers Life Fieldhouse': null,   // venue, not a team
  'Hinkle Fieldhouse': null,
  'Lucas Oil Stadium': null,
  'Simon Skjodt Assembly Hall': null,
  'Indiana Farmers Coliseum': null,
  'Mackey Arena': null,
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
  const url = `https://en.wikipedia.org/wiki/${year}_NCAA_Division_I_men%27s_basketball_tournament`;
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
    const regionKeywords = ['east', 'west', 'south', 'midwest'];
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
 * Scrape region assignments (East/West/South/Midwest) from the Wikipedia
 * tournament bracket page for a given year.
 * Returns Map<wikiTeamName, regionName> (raw Wikipedia names — caller resolves to Barttorvik).
 */
async function scrapeRegionFromWikipedia(page, year) {
  const url = `https://en.wikipedia.org/wiki/${year}_NCAA_Division_I_men%27s_basketball_tournament`;
  console.log(`\n  --- Region (Wikipedia) ---`);
  console.log(`    Navigating: ${url}`);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: PAGE_LOAD_TIMEOUT });

  const regionData = await page.evaluate(() => {
    const regionKeywords = ['east', 'west', 'south', 'midwest'];

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

    const results = [];
    const firstFourPairs = []; // Array of [team1, team2] from First Four matchups

    const headings = document.querySelectorAll('h3');

    for (const h3 of headings) {
      const headline = h3.querySelector('.mw-headline');
      const text = (headline ? headline.textContent : h3.textContent).trim().toLowerCase();

      // Parse regional bracket tables
      if (text.includes('regional')) {
        const region = regionKeywords.find(r => text.startsWith(r));
        if (!region) continue;
        const regionName = region.charAt(0).toUpperCase() + region.slice(1);

        const tables = findNextTables(h3);
        if (tables.length === 0) continue;
        const teams = extractTeamLinks(tables[0]);
        results.push({ region: regionName, teams });
        continue;
      }

      // Parse First Four / Opening Round tables
      if (text.includes('first four') || text.includes('opening round')) {
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

    return { results, firstFourPairs };
  });

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

  console.log(`    Total entries: ${regionMap.size}`);
  return regionMap;
}

/**
 * Scrape talent data from team-tables_each.php for a given year.
 * Returns Map<teamName, { talent, talent_rk }> where talent is the raw score
 * and talent_rk is the rank (row position in the table, which is sorted by talent).
 */
async function scrapeTalentPage(page, year) {
  const url = buildTalentUrl(year);
  console.log(`\n  --- Talent (team-tables_each.php) ---`);
  console.log(`    Navigating: ${url}`);
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
  console.log(`  SCRAPING YEAR ${year}`);
  console.log(`${'='.repeat(60)}`);

  const splitData = {};

  for (const [key, split] of Object.entries(splitsToRun)) {
    console.log(`\n  --- ${split.label} (prefix: ${split.prefix}) ---`);
    const url = buildUrl(year, split.params);

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

  // Scrape talent page
  let talentMap = new Map();
  try {
    talentMap = await scrapeTalentPage(page, year);
  } catch (err) {
    console.error(`    ERROR scraping talent for ${year}:`, err.message);
  }
  await sleep(DELAY_BETWEEN_PAGES_MS);

  // Scrape region data from Wikipedia
  let regionMap = new Map();
  try {
    regionMap = await scrapeRegionFromWikipedia(page, year);
  } catch (err) {
    console.error(`    ERROR scraping region for ${year}:`, err.message);
  }
  await sleep(DELAY_BETWEEN_PAGES_MS);

  // Merge splits by team name
  return mergeYearData(year, splitData, talentMap, regionMap);
}

/**
 * Merge multiple splits into one row per team.
 * Each stat column gets prefixed with the split prefix (reg_, nc_, q12_).
 * Talent data is added as unprefixed columns (talent, talent_rk).
 * Region data is matched from Wikipedia names to Barttorvik names.
 */
function mergeYearData(year, splitData, talentMap = new Map(), regionMap = new Map()) {
  // Use the regular season split as the base (it has all tournament teams)
  const baseSplit = splitData.reg || Object.values(splitData)[0];
  if (!baseSplit || baseSplit.rows.length === 0) {
    console.log(`  No base data for ${year}, skipping merge`);
    return [];
  }

  // Find the team column name (case-insensitive)
  const findCol = (headers, name) => headers.find(h => h.toLowerCase() === name.toLowerCase());
  const teamCol = findCol(baseSplit.headers, 'team') || 'Team';

  // Build a map of team -> merged row
  const merged = new Map();

  // Initialize from base split with common (non-prefixed) columns
  for (const row of baseSplit.rows) {
    const team = row[teamCol];
    if (!team) continue;

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

  // Add each split's data with prefix
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

  // Merge region data from Wikipedia
  if (regionMap.size > 0) {
    const torvikNames = new Set(merged.keys());
    let regionMatches = 0;
    const unmatchedWiki = [];

    for (const [wikiName, region] of regionMap) {
      const torvikName = matchWikiTeamName(wikiName, torvikNames);
      if (torvikName) {
        const row = merged.get(torvikName);
        if (row && !row.region) {
          row.region = region;
          regionMatches++;
        }
      } else if (torvikName !== null) {
        // null = known non-team (venue), undefined = genuine mismatch
        unmatchedWiki.push(wikiName);
      }
    }

    // Check for Barttorvik teams with no region assigned
    const missingRegion = [];
    for (const [team, row] of merged) {
      if (!row.region) missingRegion.push(team);
    }

    console.log(`  Region: matched ${regionMatches}/${merged.size} teams`);
    if (unmatchedWiki.length > 0) {
      console.log(`  Region unmatched Wikipedia names: ${unmatchedWiki.join(', ')}`);
    }
    if (missingRegion.length > 0) {
      console.log(`  Region missing for Barttorvik teams: ${missingRegion.join(', ')}`);
    }
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
  const fixedCols = ['year', 'team', 'conf', 'region', 'seed', 'talent', 'talent_rk'];
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
 * Append rows for a single year to the CSV (for incremental writing).
 * Creates the file with headers if it doesn't exist.
 */
function appendYearToCSV(yearRows, outputPath, isFirstYear) {
  if (yearRows.length === 0) return;

  // Collect all column names from these rows
  const fixedCols = ['year', 'team', 'conf', 'region', 'seed', 'talent', 'talent_rk'];
  const dynamicCols = new Set();
  for (const row of yearRows) {
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

  const lines = [];
  if (isFirstYear) {
    lines.push(allCols.join(','));
  }

  for (const row of yearRows) {
    const values = allCols.map(col => {
      const val = row[col] ?? '';
      if (String(val).includes(',') || String(val).includes('"') || String(val).includes('\n')) {
        return `"${String(val).replace(/"/g, '""')}"`;
      }
      return String(val);
    });
    lines.push(values.join(','));
  }

  if (isFirstYear) {
    fs.writeFileSync(outputPath, lines.join('\n') + '\n', 'utf8');
  } else {
    fs.appendFileSync(outputPath, lines.join('\n') + '\n', 'utf8');
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs();

  console.log('========================================');
  console.log('  Torvik Tournament Dataset Builder');
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

    // Years to skip: 2020 (no tournament — COVID), 2021 (COVID bubble — no fans,
    // cancelled games, skewed stats)
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

    const totalPages = years.length * (Object.keys(splitsToRun).length + 2); // +1 talent, +1 Wikipedia region
    console.log(`  ${years.length} years x (${Object.keys(splitsToRun).length} splits + talent + region) = ${totalPages} page loads`);
    console.log(`  Estimated time: ~${Math.ceil(totalPages * (DELAY_BETWEEN_PAGES_MS + 12000) / 60000)} minutes`);
    console.log('');

    // Scrape year by year
    const allRows = [];
    let isFirstYear = !opts.resume || progress.completedYears.length === 0;

    for (const year of years) {
      const yearRows = await scrapeYear(page, year, splitsToRun);

      if (yearRows.length > 0) {
        allRows.push(...yearRows);
        // Write incrementally so we don't lose data on crash
        appendYearToCSV(yearRows, OUTPUT_FILE, isFirstYear);
        isFirstYear = false;
      }

      // Track progress
      progress.completedYears.push(year);
      saveProgress(progress);
    }

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
