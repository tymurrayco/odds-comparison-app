// src/components/FuturesTable.tsx
import { FuturesMarket, BOOKMAKERS } from '@/lib/api';
import React from 'react';

interface FuturesTableProps {
  market: FuturesMarket;
  compactMode?: boolean;
  isMasters?: boolean; // New prop to identify Masters tab
}

export default function FuturesTable({ 
  market, 
  compactMode = false,
  isMasters = false // Default to false
}: FuturesTableProps) {
  const formatOdds = (odds: number): string => {
    if (odds > 0) return `+${odds}`;
    return odds.toString();
  };

  // Function to get last name from full name
  const getLastName = (fullName: string): string => {
    const nameParts = fullName.split(' ');
    return nameParts[nameParts.length - 1];
  };

  // Bookmaker logos mapping with type annotation
  const bookmakerLogos: { [key: string]: string } = {
    'DraftKings': '/bookmaker-logos/draftkings.png',
    'FanDuel': '/bookmaker-logos/fd.png',
    'BetMGM': '/bookmaker-logos/betmgm.png',
    'Caesars': '/bookmaker-logos/caesars.png'
  };

  // Custom CSS for handling Masters mobile display
  const mobileLastNameStyle = {
    display: 'inline-block',
    marginLeft: '4px',
    fontSize: '12px',
    fontWeight: 'bold',
    position: 'relative' as 'relative',
    zIndex: 10,
    whiteSpace: 'nowrap' as 'nowrap',
  };

  // Custom display for team cell based on whether it's Masters and screen size
  const renderTeamCell = (team: string) => {
    const teamLogoSrc = `/team-logos/${team.toLowerCase().replace(/\s+/g, '')}.png`;
    const lastName = getLastName(team);
    
    if (isMasters) {
      // For Masters - specialized approach with direct styles
      return (
        <div className="flex items-center" style={{ width: '100%', display: 'flex', alignItems: 'center' }}>
          <img 
            src={teamLogoSrc}
            alt=""
            className="h-5 w-5 mr-1"
            style={{ height: '20px', width: '20px', marginRight: '4px', flexShrink: 0 }}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          
          {/* Always show last name on mobile */}
          <span className="sm:hidden" style={mobileLastNameStyle}>
            {lastName}
          </span>
          
          {/* Show full name on desktop/tablet */}
          <span className="hidden sm:inline">
            {team}
          </span>
        </div>
      );
    } else {
      // For non-Masters tabs
      return (
        <div className="flex items-center">
          <img 
            src={teamLogoSrc}
            alt=""
            className="h-5 w-5 mr-2"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          {!compactMode ? (
            <span>{team}</span>
          ) : (
            <span className="sm:inline hidden">{team}</span>
          )}
        </div>
      );
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md mb-6 overflow-hidden">
      <div className="p-3 md:p-4 border-b border-gray-200">
        <h3 className="text-sm md:text-lg font-semibold text-gray-900">
          {market.title}
        </h3>
      </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 md:px-4 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Team
              </th>
              {BOOKMAKERS.map(book => (
                <th key={book} className="px-2 md:px-4 py-2 md:py-3 text-center">
                  <img src={bookmakerLogos[book]} alt={book} className="h-6 mx-auto" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {market.teams.map((item, index) => {
              // Determine best odds
              let bestOddsValue = -Infinity;
              let bestOddsBooks: string[] = [];
              
              BOOKMAKERS.forEach(book => {
                if (item.odds[book] !== undefined) {
                  if (item.odds[book] > bestOddsValue) {
                    bestOddsValue = item.odds[book];
                    bestOddsBooks = [book];
                  } else if (item.odds[book] === bestOddsValue) {
                    bestOddsBooks.push(book);
                  }
                }
              });
              
              return (
                <tr key={index}>
                  <td className="px-2 md:px-4 py-3 whitespace-normal text-xs md:text-sm font-medium text-gray-900">
                    {renderTeamCell(item.team)}
                  </td>
                  {BOOKMAKERS.map(book => (
                    <td key={book} className="px-2 md:px-4 py-3 whitespace-nowrap text-center">
                      {item.odds[book] !== undefined ? (
                        <div className={`text-xs md:text-sm font-medium ${
                          bestOddsBooks.includes(book) ? 'text-green-600 font-bold' : 'text-gray-900'
                        }`}>
                          {formatOdds(item.odds[book])}
                          {bestOddsBooks.includes(book) && (
                            <span className="ml-1 inline-flex items-center px-1 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Best
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs md:text-sm text-gray-500">-</span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}