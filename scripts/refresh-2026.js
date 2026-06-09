#!/usr/bin/env node

/**
 * Refresh 2026 data in torvik-tournament-dataset.csv
 *
 * 1. Scrapes 2026 via wiki-bracket mode (all teams from Torvik, filter by Wikipedia brackets)
 * 2. On success, strips old 2026 rows from the CSV and appends the fresh ones
 *
 * Usage:
 *   node scripts/refresh-2026.js              # Single attempt
 *   node scripts/refresh-2026.js --retry      # Retry every 5 minutes until success
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, '..', 'data', 'torvik-tournament-dataset.csv');
const TEMP_PATH = path.join(__dirname, '..', 'data', 'torvik-2026-temp.csv');
const RETRY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const doRetry = process.argv.includes('--retry');

function attempt() {
  console.log(`\n[${ new Date().toLocaleTimeString()}] Attempting 2026 scrape...`);

  let output;
  try {
    output = execSync(
      `node scripts/scrape-torvik-tournament.js --year 2026 --wiki-bracket`,
      { cwd: path.join(__dirname, '..'), timeout: 5 * 60 * 1000, encoding: 'utf8' }
    );
    console.log(output);
  } catch (err) {
    console.error(`Scrape failed or timed out.`);
    if (err.stdout) console.log(err.stdout);
    return false;
  }

  // Check if the scraper actually produced rows (not "COMPLETE: 0")
  const completeMatch = output.match(/COMPLETE:\s+(\d+)\s+total/);
  const rowCount = completeMatch ? parseInt(completeMatch[1], 10) : 0;
  if (rowCount === 0) {
    console.log('Scraper produced 0 rows — Torvik likely still down.');
    return false;
  }
  console.log(`Scraper produced ${rowCount} rows.`);

  // Read the CSV which now has appended 2026 rows (possibly duplicates of old ones)
  const lines = fs.readFileSync(CSV_PATH, 'utf8').split('\n');
  const header = lines[0];
  const cols = header.split(',');
  const yearIdx = cols.indexOf('year');

  // If there are duplicates (old + new), deduplicate: keep only the latest batch.
  // Since appended rows come last, take the last N 2026 rows where N = rows per batch (~68).
  // Simpler: just strip ALL 2026 rows, then re-add only the latest batch.

  // Separate historical and 2026 rows
  const historical = [];
  const all2026 = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.split(',')[yearIdx] === '2026') {
      all2026.push(line);
    } else {
      historical.push(line);
    }
  }

  // If we have duplicate 2026 batches, keep only the last batch (most recent scrape).
  // A batch is ~68 rows. If we have more than 68, keep the last 68.
  const freshBatch = all2026.length > 68 ? all2026.slice(-68) : all2026;

  // Wrap record fields for Excel
  const recIdxs = new Set();
  cols.forEach((h, i) => { if (h.includes('Rec')) recIdxs.add(i); });

  const wrappedBatch = freshBatch.map(line => {
    const fields = line.split(',');
    for (const idx of recIdxs) {
      const v = fields[idx];
      if (v && /^\d+-\d+$/.test(v)) {
        fields[idx] = '="' + v + '"';
      }
    }
    return fields.join(',');
  });

  // Write final CSV
  const finalLines = [header, ...historical, ...wrappedBatch];
  fs.writeFileSync(CSV_PATH, finalLines.join('\n') + '\n', 'utf8');

  console.log(`\nSuccess! CSV updated:`);
  console.log(`  Historical rows: ${historical.length}`);
  console.log(`  2026 rows: ${wrappedBatch.length}`);
  console.log(`  Total: ${historical.length + wrappedBatch.length}`);
  console.log(`  Output: ${CSV_PATH}`);
  return true;
}

if (doRetry) {
  console.log('Retry mode: will attempt every 5 minutes until Torvik responds.');
  const loop = () => {
    const success = attempt();
    if (success) {
      console.log('\nDone!');
      process.exit(0);
    } else {
      console.log(`\nRetrying in 5 minutes...`);
      setTimeout(loop, RETRY_INTERVAL_MS);
    }
  };
  loop();
} else {
  const success = attempt();
  process.exit(success ? 0 : 1);
}
