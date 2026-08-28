// src/lib/fcs/massey.ts

/**
 * Massey FCS ratings scraper.
 *
 * masseyratings.com sits behind a Cloudflare managed challenge and its JSON
 * feed is value-obfuscated (decoded client-side), so we launch puppeteer-extra
 * with the stealth plugin (same pattern as the KenPom scraper) and read the
 * rendered #SHCtable after the page's own JS decodes the numbers.
 *
 * Rendered columns: Team | Rec | Δ | Rat | Pwr | Off | Def | HFA | SoS | SSF | EW | EL
 * Rank+value cells render as "1\n7.42"; the team cell as "Montana St\nBig Sky".
 * "Pwr" is the points-scale rating used for spread projection.
 */

import { MASSEY_FCS_RATINGS_URL } from './constants';
import { MasseyFcsRow } from './types';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Dynamic imports to avoid webpack bundling issues (same as src/lib/kenpom/scraper.ts)
async function launchStealthBrowser() {
  const puppeteerExtra = (await import('puppeteer-extra')).default;
  const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;
  puppeteerExtra.use(StealthPlugin());
  return puppeteerExtra.launch({
    headless: 'new' as never,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
}

function parseRankValue(cell: string): { rank: number; value: number } | null {
  const parts = cell.split('\n').map((s) => s.trim());
  if (parts.length >= 2) {
    const rank = parseInt(parts[0], 10);
    const value = parseFloat(parts[1]);
    if (!isNaN(rank) && !isNaN(value)) return { rank, value };
  }
  const single = parseFloat(parts[0]);
  if (!isNaN(single)) return { rank: 0, value: single };
  return null;
}

export async function scrapeMasseyFcs(): Promise<MasseyFcsRow[]> {
  const browser = await launchStealthBrowser();
  try {
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    await page.goto(MASSEY_FCS_RATINGS_URL, {
      waitUntil: 'networkidle2',
      timeout: 90000,
    });
    // The data table renders as #SHCtable once the page JS decodes the feed
    await page.waitForFunction(
      () => {
        const t = document.querySelector('#SHCtable');
        return !!t && t.querySelectorAll('tr').length > 50;
      },
      { timeout: 60000 }
    );

    const rows: string[][] = await page.evaluate(() => {
      const table = document.querySelector('#SHCtable');
      if (!table) return [];
      return [...table.querySelectorAll('tr')].map((tr) =>
        [...tr.querySelectorAll('th,td')].map((c) =>
          (c as HTMLElement).innerText.trim()
        )
      );
    });

    if (rows.length < 3) throw new Error(`Massey table too small (${rows.length} rows)`);

    const header = rows[0].map((h) => h.trim());
    const col = (name: string) => header.indexOf(name);
    const iTeam = col('Team');
    const iRat = col('Rat');
    const iPwr = col('Pwr');
    const iOff = col('Off');
    const iDef = col('Def');
    const iHfa = col('HFA');
    if ([iTeam, iRat, iPwr, iOff, iDef, iHfa].some((i) => i < 0)) {
      throw new Error(`Massey header changed: ${header.join(' | ')}`);
    }

    const out: MasseyFcsRow[] = [];
    for (const row of rows.slice(1)) {
      if (row.length < header.length) continue;
      const teamCell = row[iTeam].split('\n').map((s) => s.trim());
      const name = teamCell[0];
      if (!name || name === 'Correlation' || name === 'Team') continue;

      const rat = parseRankValue(row[iRat]);
      const pwr = parseRankValue(row[iPwr]);
      const off = parseRankValue(row[iOff]);
      const def = parseRankValue(row[iDef]);
      const hfa = parseFloat(row[iHfa]);
      if (!pwr || !rat) continue;

      out.push({
        masseyName: name,
        conference: teamCell[1] ?? '',
        rank: pwr.rank,
        rat: rat.value,
        pwr: pwr.value,
        off: off?.value ?? 0,
        def: def?.value ?? 0,
        hfa: isNaN(hfa) ? 2.5 : hfa,
      });
    }

    if (out.length < 100) {
      throw new Error(`Only parsed ${out.length} Massey FCS teams — expected ~128`);
    }
    return out;
  } finally {
    await browser.close();
  }
}
