// app/api/possession-data/route.ts
import { NextResponse } from 'next/server';

export interface PossessionData {
  team: string;
  ove: number;     // Offensive Value per possession
  oveRank: number;
  dve: number;     // Defensive Value per possession  
  dveRank: number;
  sve: number;     // Special teams value per possession
  sveRank: number;
  ovg: number;     // Offensive Value per Game
  dvg: number;     // Defensive Value per Game
  svg: number;     // Special teams value per game
  npg: number;     // Non-garbage Possessions per Game
}

export async function GET() {
  try {
    const response = await fetch('https://bcftoys.com/2025-pve');
    
    if (!response.ok) {
      throw new Error('Failed to fetch possession data from source');
    }
    
    const html = await response.text();
    const teams = parsePossessionTable(html);
    
    return NextResponse.json(teams, {
      headers: {
        'Cache-Control': 's-maxage=3600, stale-while-revalidate',
      },
    });
  } catch (error) {
    console.error('Error fetching possession data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch possession data' },
      { status: 500 }
    );
  }
}

function parsePossessionTable(html: string): PossessionData[] {
  const teams: PossessionData[] = [];
  
  // Find the table
  const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/);
  if (!tableMatch) {
    console.error('Could not find table in HTML');
    return teams;
  }
  
  const tableContent = tableMatch[1];
  
  // Extract all <tr> elements
  const rowMatches = [...tableContent.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
  
  // Find header row to get column indices
  const headerIndices: Record<string, number> = {};
  let foundHeader = false;
  
  for (const rowMatch of rowMatches) {
    const row = rowMatch[1];
    
    // Check if this is a header row
    if (row.includes('<th')) {
      const headerCells = [...row.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)];
      const headers = headerCells.map(h => h[1].replace(/<[^>]*>/g, '').trim());
      
      // Map header positions
      headers.forEach((header, index) => {
        if (header === 'Team') headerIndices.team = index;
        if (header === 'OVE') headerIndices.ove = index;
        if (header === 'DVE') headerIndices.dve = index;
        if (header === 'SVE') headerIndices.sve = index;
        if (header === 'OVG') headerIndices.ovg = index;
        if (header === 'DVG') headerIndices.dvg = index;
        if (header === 'SVG') headerIndices.svg = index;
        if (header === 'NPG') headerIndices.npg = index;
      });
      
      // Find rank columns (they appear after each efficiency column)
      for (let i = 0; i < headers.length; i++) {
        if (headers[i] === 'Rk') {
          if (i > headerIndices.ove && !headerIndices.oveRank) {
            headerIndices.oveRank = i;
          } else if (i > headerIndices.dve && !headerIndices.dveRank) {
            headerIndices.dveRank = i;
          } else if (i > headerIndices.sve && !headerIndices.sveRank) {
            headerIndices.sveRank = i;
          }
        }
      }
      
      foundHeader = true;
      continue;
    }
    
    if (!foundHeader) continue;
    
    // Skip rows without <td> tags
    if (!row.includes('<td')) continue;
    
    // Extract all <td> elements from this row
    const cellMatches = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)];
    
    if (cellMatches.length < 20) continue; // Skip incomplete rows
    
    // Clean HTML tags from cell content
    const cleanCell = (cell: string) => {
      let cleaned = cell.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
      // Handle decimal values that start with just a period
      if (cleaned.startsWith('.')) {
        cleaned = '0' + cleaned;
      }
      if (cleaned.startsWith('-.')) {
        cleaned = '-0' + cleaned.substring(1);
      }
      return cleaned;
    };
    
    try {
      const cells = cellMatches.map(match => cleanCell(match[1]));
      
      const teamName = cells[headerIndices.team];
      
      // Skip if no team name or if it's a header row
      if (!teamName || teamName === '' || teamName === 'Team') {
        continue;
      }
      
      const teamData: PossessionData = {
        team: teamName,
        ove: parseFloat(cells[headerIndices.ove] || '0') || 0,
        oveRank: parseInt(cells[headerIndices.oveRank] || '0') || 0,
        dve: parseFloat(cells[headerIndices.dve] || '0') || 0,
        dveRank: parseInt(cells[headerIndices.dveRank] || '0') || 0,
        sve: parseFloat(cells[headerIndices.sve] || '0') || 0,
        sveRank: parseInt(cells[headerIndices.sveRank] || '0') || 0,
        ovg: parseFloat(cells[headerIndices.ovg] || '0') || 0,
        dvg: parseFloat(cells[headerIndices.dvg] || '0') || 0,
        svg: parseFloat(cells[headerIndices.svg] || '0') || 0,
        npg: parseFloat(cells[headerIndices.npg] || '0') || 0,
      };
      
      teams.push(teamData);
    } catch (err) {
      console.error('Error parsing row:', err);
      continue;
    }
  }
  
  return teams;
}