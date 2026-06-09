#!/usr/bin/env node

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, '..', 'data', 'torvik-tournament-dataset.csv');
const TEAMS_PLAYED_TODAY = ['Michigan', 'Purdue', 'Vanderbilt', 'Arkansas', 'South Florida', 'Wichita St.', 'Yale', 'Penn', 'Dayton', 'VCU'];

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  console.log('Fetching current Torvik data...');
  try {
    await page.goto('https://barttorvik.com/trank.php?year=2026&showcol=All', {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });
  } catch (err) {
    console.error('Torvik page timed out. Still down.');
    await browser.close();
    process.exit(1);
  }

  await new Promise(r => setTimeout(r, 3000));

  const data = await page.evaluate(() => {
    const table = document.querySelector('table');
    if (!table) return { error: 'no table', totalRows: 0, results: {} };
    const rows = table.querySelectorAll('tbody tr');
    const results = {};
    let totalRows = 0;
    rows.forEach(row => {
      const teamLink = row.querySelector('a[href*="team.php"]');
      if (!teamLink) return;
      const name = teamLink.childNodes[0]?.textContent?.trim();
      totalRows++;
      const cells = row.querySelectorAll('td');
      results[name] = {
        adjOE: cells[5]?.childNodes[0]?.textContent?.trim() || '',
        adjDE: cells[6]?.childNodes[0]?.textContent?.trim() || '',
      };
    });
    return { totalRows, results };
  });

  await browser.close();

  if (data.totalRows === 0) {
    console.log('Torvik returned 0 rows. Still down.');
    process.exit(1);
  }

  console.log(`Torvik has ${data.totalRows} teams on the page.\n`);

  // Read CSV
  const csvLines = fs.readFileSync(CSV_PATH, 'utf8').split('\n');
  const header = csvLines[0].split(',');
  const teamIdx = header.indexOf('team');
  const regAdjOEIdx = header.indexOf('reg_AdjOE');
  const regAdjDEIdx = header.indexOf('reg_AdjDE');

  console.log('Team'.padEnd(20), 'CSV AdjOE'.padEnd(12), 'CSV AdjDE'.padEnd(12), 'Torvik OE'.padEnd(12), 'Torvik DE'.padEnd(12), 'Changed?');
  console.log('-'.repeat(80));

  for (const team of TEAMS_PLAYED_TODAY) {
    const csvRow = csvLines.find(l => {
      const fields = l.split(',');
      return fields[0] === '2026' && fields[teamIdx] === team;
    });
    const csvFields = csvRow ? csvRow.split(',') : [];
    const csvOE = csvFields[regAdjOEIdx] || 'n/a';
    const csvDE = csvFields[regAdjDEIdx] || 'n/a';
    const torvik = data.results[team];
    const tOE = torvik ? torvik.adjOE : 'not found';
    const tDE = torvik ? torvik.adjDE : 'not found';
    const changed = (csvOE !== tOE || csvDE !== tDE) ? 'YES' : 'no';
    console.log(team.padEnd(20), csvOE.padEnd(12), csvDE.padEnd(12), tOE.padEnd(12), tDE.padEnd(12), changed);
  }
})();
