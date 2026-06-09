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
 *   node scripts/scrape-torvik-tournament.js --wiki-bracket   # Use Wikipedia seed tables for 2026+ (bypasses Torvik NCAA filter)
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
const DEFAULT_END_YEAR   = 2026;

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

/**
 * Escape a value for CSV export. Wraps W-L records (e.g. "6-10") with ="..."
 * so Excel doesn't auto-format them as dates.
 */
function csvEscape(val) {
  const s = String(val ?? '');
  // W-L records like "6-10", "30-3", "13-3" — prevent Excel date interpretation
  if (/^\d{1,3}-\d{1,3}$/.test(s)) {
    return `="${s}"`;
  }
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
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
    allTeams: false,
    wikiBracket: false,
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
      case '--all-teams':
        opts.allTeams = true;
        break;
      case '--wiki-bracket':
        opts.wikiBracket = true;
        break;
    }
  }

  return opts;
}

function buildUrl(year, extraParams = {}, allTeams = false) {
  const base = 'https://barttorvik.com/trank.php';
  const baseParams = { year: String(year), ...extraParams };
  if (!allTeams) baseParams.conlimit = 'NCAA';
  const params = new URLSearchParams(baseParams);
  return `${base}?${params.toString()}`;
}

function buildTalentUrl(year, allTeams = false) {
  const base = 'https://barttorvik.com/team-tables_each.php';
  const baseParams = { year: String(year) };
  if (!allTeams) baseParams.conlimit = 'NCAA';
  const params = new URLSearchParams(baseParams);
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
  "St. Mary's": "Saint Mary's",
  'California Baptist': 'Cal Baptist',
  "Hawai'i": 'Hawaii',
  'Hawai\u02BBi': 'Hawaii',
  'Hawai\u2018i': 'Hawaii',
  'Hawai\u2019i': 'Hawaii',

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
 * Scrape seed + region data from Wikipedia bracket tables for a given year.
 * Bracket tables have rows where cell[1] = seed number, cell[2] = team name.
 * Each regional heading (e.g. "South regional") is followed by its bracket table.
 * Also handles First Four matchups (two teams separated by "/" in one cell).
 * Returns Map<wikiTeamName, { region, seed }>.
 */
async function scrapeWikipediaSeedTable(page, year) {
  const url = `https://en.wikipedia.org/wiki/${year}_NCAA_Division_I_men%27s_basketball_tournament`;
  console.log(`\n  --- Wikipedia Bracket Tables (seeds + regions) ---`);
  console.log(`    Navigating: ${url}`);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: PAGE_LOAD_TIMEOUT });

  const entries = await page.evaluate(() => {
    const regionKeywords = ['east', 'west', 'south', 'midwest'];
    const results = [];
    const seen = new Set();

    function findNextTable(h) {
      const wrapper = h.closest('.mw-heading') || h.parentElement;
      let el = wrapper.nextElementSibling;
      while (el) {
        if (el.tagName === 'TABLE') return el;
        if (el.tagName === 'DIV' || el.tagName === 'SECTION') {
          const t = el.querySelector('table');
          if (t) return t;
        }
        if (el.tagName && el.tagName.match(/^H[23]$/)) break;
        if (el.classList && el.classList.contains('mw-heading')) break;
        el = el.nextElementSibling;
      }
      return null;
    }

    const headings = document.querySelectorAll('h3');
    for (const h3 of headings) {
      const headline = h3.querySelector('.mw-headline');
      const text = (headline ? headline.textContent : h3.textContent).trim().toLowerCase();
      if (!text.includes('regional')) continue;
      const region = regionKeywords.find(r => text.startsWith(r));
      if (!region) continue;
      const regionName = region.charAt(0).toUpperCase() + region.slice(1);

      const table = findNextTable(h3);
      if (!table) continue;

      const rows = table.querySelectorAll('tr');
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length < 3) continue;

        // Seed is in cell[1], team name in cell[2]
        const seedText = cells[1].textContent.trim();
        if (!/^\d{1,2}$/.test(seedText)) continue;
        const seed = seedText;

        // Team cell may have links (team names) or text with "/" for First Four
        const teamCell = cells[2];
        const links = teamCell.querySelectorAll('a');
        const teamLinks = [];
        links.forEach(link => {
          const href = link.getAttribute('href') || '';
          const name = link.textContent.trim();
          if (name && name.length > 1 && /\/wiki\/\d{4}/.test(href)) {
            teamLinks.push(name);
          }
        });

        if (teamLinks.length === 0) {
          // Fallback: use cell text, split on "/" for First Four matchups
          const cellText = teamCell.textContent.trim();
          const names = cellText.includes('/') ? cellText.split('/').map(s => s.trim()) : [cellText];
          for (const name of names) {
            if (name && name.length > 1 && !seen.has(name)) {
              seen.add(name);
              results.push({ team: name, region: regionName, seed });
            }
          }
        } else {
          // One or more teams (First Four has two separated by "/")
          for (const name of teamLinks) {
            // Split on "/" in case link text contains combined names
            const parts = name.includes('/') ? name.split('/').map(s => s.trim()) : [name];
            for (const part of parts) {
              if (part && part.length > 1 && !seen.has(part)) {
                seen.add(part);
                results.push({ team: part, region: regionName, seed });
              }
            }
          }
        }
      }
    }

    return results;
  });

  // Build map
  const bracketMap = new Map();
  for (const { team, region, seed } of entries) {
    bracketMap.set(team, { region, seed });
  }

  // Log summary
  const byRegion = {};
  for (const { region } of bracketMap.values()) {
    byRegion[region] = (byRegion[region] || 0) + 1;
  }
  for (const [region, count] of Object.entries(byRegion)) {
    console.log(`    ${region}: ${count} teams`);
  }
  console.log(`    Total: ${bracketMap.size} teams`);

  return bracketMap;
}

/**
 * Scrape talent data from team-tables_each.php for a given year.
 * Returns Map<teamName, { talent, talent_rk }> where talent is the raw score
 * and talent_rk is the rank (row position in the table, which is sorted by talent).
 */
async function scrapeTalentPage(page, year, allTeams = false) {
  const url = buildTalentUrl(year, allTeams);
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
async function scrapeYear(page, year, splitsToRun, allTeams = false, wikiBracket = false) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  SCRAPING YEAR ${year}`);
  if (wikiBracket) console.log(`  MODE: wiki-bracket (all teams from Torvik, filter by Wikipedia seed tables)`);
  console.log(`${'='.repeat(60)}`);

  // In wiki-bracket mode, scrape all teams from Torvik (no NCAA filter)
  const useAllTeams = allTeams || wikiBracket;

  const splitData = {};

  for (const [key, split] of Object.entries(splitsToRun)) {
    console.log(`\n  --- ${split.label} (prefix: ${split.prefix}) ---`);
    const url = buildUrl(year, split.params, useAllTeams);

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
    talentMap = await scrapeTalentPage(page, year, useAllTeams);
  } catch (err) {
    console.error(`    ERROR scraping talent for ${year}:`, err.message);
  }
  await sleep(DELAY_BETWEEN_PAGES_MS);

  // Wiki-bracket mode: get seed + region from Wikipedia seed tables, then filter
  if (wikiBracket) {
    let wikiBracketMap = new Map();
    try {
      wikiBracketMap = await scrapeWikipediaSeedTable(page, year);
    } catch (err) {
      console.error(`    ERROR scraping Wikipedia seed tables for ${year}:`, err.message);
    }
    await sleep(DELAY_BETWEEN_PAGES_MS);

    return mergeYearData(year, splitData, talentMap, new Map(), wikiBracketMap);
  }

  // Scrape region data from Wikipedia (skip when pulling all teams — no bracket yet)
  let regionMap = new Map();
  if (!allTeams) {
    try {
      regionMap = await scrapeRegionFromWikipedia(page, year);
    } catch (err) {
      console.error(`    ERROR scraping region for ${year}:`, err.message);
    }
    await sleep(DELAY_BETWEEN_PAGES_MS);
  } else {
    console.log(`\n  --- Region (Wikipedia) ---`);
    console.log(`    Skipped (--all-teams mode, no bracket data)`);
  }

  // Merge splits by team name
  return mergeYearData(year, splitData, talentMap, regionMap);
}

/**
 * Merge multiple splits into one row per team.
 * Each stat column gets prefixed with the split prefix (reg_, nc_, q12_).
 * Talent data is added as unprefixed columns (talent, talent_rk).
 * Region data is matched from Wikipedia names to Barttorvik names.
 *
 * If wikiBracketMap is provided (from --wiki-bracket mode), it's a
 * Map<wikiTeamName, { region, seed }> from the Wikipedia seed tables.
 * Teams are filtered to only those in the bracket, and seed + region
 * come from Wikipedia instead of Torvik/bracket tables.
 */
function mergeYearData(year, splitData, talentMap = new Map(), regionMap = new Map(), wikiBracketMap = new Map()) {
  // Use the split with the most rows as the base.
  // Normally reg has all tournament teams, but in wiki-bracket mode Torvik may
  // filter reg to NCAA teams while nc/q12 still have all 365.
  let baseSplit = splitData.reg || Object.values(splitData)[0];
  if (wikiBracketMap.size > 0) {
    for (const split of Object.values(splitData)) {
      if (split.rows.length > baseSplit.rows.length) baseSplit = split;
    }
  }
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

  // Wiki-bracket mode: filter to bracket teams and assign seed + region from Wikipedia
  if (wikiBracketMap.size > 0) {
    const torvikNames = new Set(merged.keys());
    let matched = 0;
    const unmatchedWiki = [];
    const keepTeams = new Set();

    for (const [wikiName, { region, seed }] of wikiBracketMap) {
      const torvikName = matchWikiTeamName(wikiName, torvikNames);
      if (torvikName) {
        const row = merged.get(torvikName);
        if (row) {
          row.region = region;
          row.seed = seed;
          keepTeams.add(torvikName);
          matched++;
        }
      } else if (torvikName !== null) {
        unmatchedWiki.push(wikiName);
      }
    }

    // Remove teams not in the bracket
    const beforeCount = merged.size;
    for (const team of [...merged.keys()]) {
      if (!keepTeams.has(team)) merged.delete(team);
    }

    console.log(`  Wiki-bracket: matched ${matched}/${wikiBracketMap.size} Wikipedia teams to Torvik`);
    console.log(`  Filtered ${beforeCount} → ${merged.size} teams`);
    if (unmatchedWiki.length > 0) {
      console.log(`  Wiki-bracket unmatched names: ${unmatchedWiki.join(', ')}`);
    }

    const result = Array.from(merged.values());
    console.log(`  Merged ${result.length} teams for ${year}`);
    return result;
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
      return csvEscape(val);
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
      return csvEscape(val);
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
  if (opts.allTeams) console.log('  MODE: ALL TEAMS (no NCAA tournament filter)');
  if (opts.wikiBracket) console.log('  MODE: WIKI-BRACKET (seeds + regions from Wikipedia for 2026+)');
  console.log('');

  // Launch browser once, reuse for all pages
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
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

    // -----------------------------------------------------------------------
    // Preflight: if 2026 is in the range (and not --all-teams), verify data
    // sources are live before committing to a 20+ minute scrape.
    //
    // --wiki-bracket mode: only checks Wikipedia seed tables (skips Torvik NCAA check)
    // Default mode: checks both Wikipedia bracket tables and Torvik NCAA seeds
    // -----------------------------------------------------------------------
    if (!opts.allTeams && opts.endYear >= 2026 && !opts.test) {
      console.log('  PREFLIGHT: checking 2026 data availability...\n');

      if (opts.wikiBracket) {
        // Wiki-bracket mode: check that Wikipedia seed tables have teams
        const testMap = await scrapeWikipediaSeedTable(page, 2026);
        if (testMap.size < 64) {
          console.error(`\n  ✗ PREFLIGHT FAILED: Wikipedia seed tables only have ${testMap.size} teams (need at least 64).`);
          console.error('    Seed table data is not complete yet. Try again later.');
          await browser.close();
          process.exit(1);
        }
        console.log(`    ✓ Wikipedia seed tables have ${testMap.size} teams`);
        await sleep(DELAY_BETWEEN_PAGES_MS);
      } else {
        // Default mode: check Wikipedia bracket tables + Torvik NCAA seeds
        const wikiUrl = 'https://en.wikipedia.org/wiki/2026_NCAA_Division_I_men%27s_basketball_tournament';
        console.log(`    [Wikipedia] ${wikiUrl}`);
        await page.goto(wikiUrl, { waitUntil: 'networkidle2', timeout: PAGE_LOAD_TIMEOUT });
        const wikiCheck = await page.evaluate(() => {
          const regionKeywords = ['east', 'west', 'south', 'midwest'];
          const regions = [];

          function findNextTables(h) {
            const wrapper = h.closest('.mw-heading') || h.parentElement;
            let el = wrapper.nextElementSibling;
            const tables = [];
            while (el) {
              if (el.tagName === 'TABLE') tables.push(el);
              else if (el.tagName === 'DIV' || el.tagName === 'SECTION') {
                el.querySelectorAll('table').forEach(t => tables.push(t));
              }
              if (el.tagName && el.tagName.match(/^H[23]$/)) break;
              if (el.classList && el.classList.contains('mw-heading')) break;
              el = el.nextElementSibling;
            }
            return tables;
          }

          const headings = document.querySelectorAll('h3');
          for (const h3 of headings) {
            const headline = h3.querySelector('.mw-headline');
            const text = (headline ? headline.textContent : h3.textContent).trim().toLowerCase();
            if (!text.includes('regional')) continue;
            const region = regionKeywords.find(r => text.startsWith(r));
            if (!region) continue;

            const tables = findNextTables(h3);
            let teamCount = 0;
            if (tables.length > 0) {
              const links = tables[0].querySelectorAll('a');
              const seen = new Set();
              links.forEach(link => {
                const href = link.getAttribute('href') || '';
                const name = link.textContent.trim();
                if (name && name.length > 1 && !/^\d+$/.test(name) && !seen.has(name) && /\/wiki\/\d{4}/.test(href)) {
                  seen.add(name);
                  teamCount++;
                }
              });
            }
            regions.push({ region: region.charAt(0).toUpperCase() + region.slice(1), teamCount });
          }
          return regions;
        });

        const regionsWithTeams = wikiCheck.filter(r => r.teamCount > 0);
        const totalTeams = wikiCheck.reduce((sum, r) => sum + r.teamCount, 0);

        if (wikiCheck.length < 4) {
          console.error(`\n  ✗ PREFLIGHT FAILED: Wikipedia only has ${wikiCheck.length}/4 regional bracket headings for 2026.`);
          console.error('    Region data is not available yet. Try again after the bracket is published on Wikipedia.');
          await browser.close();
          process.exit(1);
        }
        if (regionsWithTeams.length < 4) {
          const empty = wikiCheck.filter(r => r.teamCount === 0).map(r => r.region).join(', ');
          console.error(`\n  ✗ PREFLIGHT FAILED: Wikipedia has bracket headings but ${empty} have no teams yet.`);
          console.error('    Teams have not been added to the bracket tables. Try again later.');
          await browser.close();
          process.exit(1);
        }
        for (const r of wikiCheck) {
          console.log(`    ${r.region}: ${r.teamCount} teams`);
        }
        console.log(`    ✓ Wikipedia has ${regionsWithTeams.length}/4 brackets with ${totalTeams} total teams`);

        // Check 2: Torvik seed data (quick probe of conlimit=NCAA)
        // Torvik may redirect when no NCAA teams exist yet, so catch navigation errors.
        const torvikUrl = buildUrl(2026, {}, false); // conlimit=NCAA
        console.log(`    [Torvik]    ${torvikUrl}`);
        let seedCheck = { teamCount: 0, seedCount: 0 };
        try {
          await page.goto(torvikUrl, { waitUntil: 'networkidle2', timeout: PAGE_LOAD_TIMEOUT });
          await sleep(2000); // let any late redirects settle
          seedCheck = await page.evaluate(() => {
            const table = document.querySelector('#content-area table, table.pointed, table');
            if (!table) return { teamCount: 0, seedCount: 0 };
            const rows = table.querySelectorAll('tbody tr');
            let teamCount = 0;
            let seedCount = 0;
            rows.forEach(row => {
              const teamCell = row.querySelector('td a[href*="team.php"]');
              if (!teamCell) return;
              teamCount++;
              const lowrow = teamCell.querySelector('.lowrow');
              if (lowrow && /\d+\s*seed/.test(lowrow.textContent)) seedCount++;
            });
            return { teamCount, seedCount };
          });
        } catch (err) {
          // Navigation error likely means Torvik redirected (no NCAA data yet)
          console.error(`\n  ✗ PREFLIGHT FAILED: Torvik page errored for 2026 (${err.message}).`);
          console.error('    Torvik likely has not flagged tournament teams yet. Try again later.');
          await browser.close();
          process.exit(1);
        }
        if (seedCheck.teamCount === 0) {
          console.error(`\n  ✗ PREFLIGHT FAILED: Torvik conlimit=NCAA returned 0 teams for 2026.`);
          console.error('    Torvik has not flagged tournament teams yet. Try again later.');
          await browser.close();
          process.exit(1);
        }
        if (seedCheck.seedCount === 0) {
          console.error(`\n  ✗ PREFLIGHT FAILED: Torvik has ${seedCheck.teamCount} NCAA teams but 0 have seed data.`);
          console.error('    Seeds are not populated yet. Try again later.');
          await browser.close();
          process.exit(1);
        }
        console.log(`    ✓ Torvik has ${seedCheck.teamCount} NCAA teams, ${seedCheck.seedCount} with seeds`);

        await sleep(DELAY_BETWEEN_PAGES_MS);
      }

      console.log('\n  PREFLIGHT PASSED — proceeding with full scrape.\n');
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
    // When scraping a single year with --year and the CSV already exists, append instead of overwrite
    let isFirstYear;
    if (opts.singleYear && fs.existsSync(OUTPUT_FILE)) {
      isFirstYear = false;
    } else {
      isFirstYear = !opts.resume || progress.completedYears.length === 0;
    }

    for (const year of years) {
      // Use wiki-bracket mode for the current year (2026+) when --wiki-bracket is set
      const useWikiBracket = opts.wikiBracket && year >= 2026;
      const yearRows = await scrapeYear(page, year, splitsToRun, opts.allTeams, useWikiBracket);

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
