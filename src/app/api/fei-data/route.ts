// app/api/fei-data/route.ts
import { NextResponse } from 'next/server';
import { FEITeamData } from '@/lib/feiData';

export async function GET() {
  try {
    const response = await fetch('https://bcftoys.com/2025-fei');
    
    if (!response.ok) {
      throw new Error('Failed to fetch FEI data from source');
    }
    
    const html = await response.text();
    const teams = parseeFEITable(html);
    
    return NextResponse.json(teams, {
      headers: {
        'Cache-Control': 's-maxage=3600, stale-while-revalidate',
      },
    });
  } catch (error) {
    console.error('Error fetching FEI data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch FEI data' },
      { status: 500 }
    );
  }
}

function parseeFEITable(html: string): FEITeamData[] {
  const teams: FEITeamData[] = [];
  
  // First, let's try to find the table
  const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/);
  if (!tableMatch) {
    console.error('Could not find table in HTML');
    return teams;
  }
  
  const tableContent = tableMatch[1];
  
  // Extract all <tr> elements
  const rowMatches = [...tableContent.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
  
  for (const rowMatch of rowMatches) {
    const row = rowMatch[1];
    
    // Skip header rows (those with <th> tags)
    if (row.includes('<th')) {
      continue;
    }
    
    // Extract all <td> elements from this row
    const cellMatches = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)];
    
    if (cellMatches.length < 20) continue; // Skip incomplete rows
    
    // Clean HTML tags from cell content
    const cleanCell = (cell: string) => {
      let cleaned = cell.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
      // Handle decimal values that start with just a period (e.g., ".78" -> "0.78")
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
      
      // Skip header row
      if (cells[0] === 'Rk' || cells[1] === 'Team') {
        continue;
      }
      
      // Parse each cell according to the table structure
      // Note: There are empty cells at indices 5, 12, and 19 in the data
      const teamData: FEITeamData = {
        rank: parseInt(cells[0]) || 0,
        team: cells[1],
        record: cells[2] === '-' ? undefined : cells[2],
        fbs: cells[3] === '-' ? undefined : cells[3],
        fei: parseFloat(cells[4]) || 0,
        ofei: parseFloat(cells[6]) || 0,    // Skip empty cell at 5
        ofeiRank: parseInt(cells[7]) || 0,
        dfei: parseFloat(cells[8]) || 0,
        dfeiRank: parseInt(cells[9]) || 0,
        sfei: parseFloat(cells[10]) || 0,
        sfeiRank: parseInt(cells[11]) || 0,
        els: parseFloat(cells[13]) || 0,    // Skip empty cell at 12
        elsRank: parseInt(cells[14]) || 0,
        gls: parseFloat(cells[15]) || 0,
        glsRank: parseInt(cells[16]) || 0,
        als: parseFloat(cells[17]) || 0,
        alsRank: parseInt(cells[18]) || 0,
        ewd: parseFloat(cells[20]) || 0,    // Skip empty cell at 19
        ewdRank: parseInt(cells[21]) || 0,
        gwd: parseFloat(cells[22]) || 0,
        gwdRank: parseInt(cells[23]) || 0,
        awd: parseFloat(cells[24]) || 0,
        awdRank: parseInt(cells[25]) || 0,
      };
      
      // Only add if we have a valid team name and it's not a header
      if (teamData.team && 
          teamData.team !== '' && 
          teamData.team !== '-' && 
          teamData.team !== 'Team' &&
          teamData.rank > 0) {
        teams.push(teamData);
      }
    } catch (err) {
      console.error('Error parsing row:', err);
      continue;
    }
  }
  
  return teams;
}