// src/components/PropsTable.tsx
'use client';

import React, { useState } from 'react';
import { ProcessedPropsMarket, ProcessedProp, BOOKMAKERS } from '@/lib/api';

interface PropsTableProps {
  markets: ProcessedPropsMarket[];
  selectedBookmakers?: string[];
  playerFilter?: string;
}

export default function PropsTable({ 
  markets, 
  selectedBookmakers,
  playerFilter = ''
}: PropsTableProps) {
  const [expandedMarkets, setExpandedMarkets] = useState<{ [key: string]: boolean }>({});
  
  // Use selected bookmakers or default to all
  const displayBookmakers = selectedBookmakers && selectedBookmakers.length > 0 
    ? BOOKMAKERS.filter(b => selectedBookmakers.includes(b))
    : BOOKMAKERS;

  const formatOdds = (odds: number | null): string => {
    if (odds === null) return '-';
    if (odds > 0) return `+${odds}`;
    return odds.toString();
  };

  // Bookmaker logos mapping
  const bookmakerLogos: { [key: string]: string } = {
    'DraftKings': '/bookmaker-logos/draftkings.png',
    'FanDuel': '/bookmaker-logos/fd.png',
    'BetMGM': '/bookmaker-logos/betmgm.png',
    'BetRivers': '/bookmaker-logos/betrivers.png',
    'Caesars': '/bookmaker-logos/caesars.png',
    'BetOnline.ag': '/bookmaker-logos/betonline.png'
  };

  // Toggle market expansion
  const toggleMarket = (marketKey: string) => {
    setExpandedMarkets(prev => ({
      ...prev,
      [marketKey]: !prev[marketKey]
    }));
  };

  // Filter props by player name
  const filterProps = (props: ProcessedProp[]): ProcessedProp[] => {
    if (!playerFilter.trim()) return props;
    const searchTerm = playerFilter.toLowerCase().trim();
    return props.filter(prop => 
      prop.playerName.toLowerCase().includes(searchTerm)
    );
  };

  // Find best odds for over and under across bookmakers (considering same line)
  const findBestOdds = (prop: ProcessedProp): { bestOver: string[], bestUnder: string[] } => {
    let bestOverValue = -Infinity;
    let bestUnderValue = -Infinity;
    let bestOver: string[] = [];
    let bestUnder: string[] = [];

    displayBookmakers.forEach(book => {
      const odds = prop.odds[book];
      if (odds) {
        if (odds.over !== null) {
          if (odds.over > bestOverValue) {
            bestOverValue = odds.over;
            bestOver = [book];
          } else if (odds.over === bestOverValue) {
            bestOver.push(book);
          }
        }
        if (odds.under !== null) {
          if (odds.under > bestUnderValue) {
            bestUnderValue = odds.under;
            bestUnder = [book];
          } else if (odds.under === bestUnderValue) {
            bestUnder.push(book);
          }
        }
      }
    });

    return { bestOver, bestUnder };
  };

  if (!markets || markets.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
        No player props available for this game.
      </div>
    );
  }

  // Filter markets to only show those with matching props
  const filteredMarkets = markets.map(market => ({
    ...market,
    props: filterProps(market.props)
  })).filter(market => market.props.length > 0);

  if (filteredMarkets.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
        No props found matching &quot;{playerFilter}&quot;
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {filteredMarkets.map((market) => {
        // Default to collapsed (false) if not set, otherwise use the stored value
        const isExpanded = expandedMarkets[market.marketKey] ?? false;
        
        return (
          <div key={market.marketKey} className="bg-white rounded-lg shadow-md overflow-hidden">
            {/* Market Header - Click to toggle */}
            <div 
              className="p-3 md:p-4 border-b border-blue-400 bg-blue-500 cursor-pointer flex items-center justify-between hover:bg-blue-600 transition-colors"
              onClick={() => toggleMarket(market.marketKey)}
            >
              <h3 className="text-sm md:text-lg font-semibold text-white">
                {market.marketName}
                <span className="ml-2 text-xs md:text-sm font-normal text-blue-100">
                  ({market.props.length} player{market.props.length !== 1 ? 's' : ''})
                </span>
              </h3>
              <svg 
                className={`w-5 h-5 text-white transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            
            {/* Props Table - Only show when expanded */}
            {isExpanded && (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-blue-50">
                    <tr>
                      <th className="px-2 md:px-4 py-2 md:py-3 text-left text-xs font-medium text-blue-700 uppercase tracking-wider min-w-[140px]">
                        Player
                      </th>
                      {displayBookmakers.map(book => (
                        <th key={book} className="px-1 md:px-3 py-2 md:py-3 text-center min-w-[80px]">
                          <img src={bookmakerLogos[book]} alt={book} className="h-5 md:h-6 mx-auto" />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {market.props.map((prop, index) => {
                      const { bestOver, bestUnder } = findBestOdds(prop);
                      
                      return (
                        <tr key={`${prop.playerName}-${index}`} className="hover:bg-gray-50">
                          <td className="px-2 md:px-4 py-2 md:py-3 whitespace-nowrap text-xs md:text-sm font-medium text-gray-900">
                            <span className="truncate max-w-[120px] md:max-w-none">
                              {prop.playerName}
                            </span>
                          </td>
                          {displayBookmakers.map(book => {
                            const odds = prop.odds[book];
                            const isOverBest = bestOver.includes(book);
                            const isUnderBest = bestUnder.includes(book);
                            const hasData = odds && (odds.over !== null || odds.under !== null);
                            
                            return (
                              <td 
                                key={`${book}-${prop.playerName}`}
                                className="px-1 md:px-3 py-2 md:py-3 whitespace-nowrap text-center border-r border-gray-100 last:border-r-0"
                              >
                                {hasData ? (
                                  <div className="flex flex-col items-center gap-0.5">
                                    {/* Line */}
                                    <span className="text-[10px] md:text-xs font-semibold text-gray-700">
                                      {odds.line}
                                    </span>
                                    {/* Over/Under odds */}
                                    <div className="flex gap-1 text-[10px] md:text-xs">
                                      <span className={`${isOverBest ? 'text-green-600 font-bold' : 'text-gray-600'}`}>
                                        o{formatOdds(odds.over)}
                                      </span>
                                      <span className="text-gray-300">/</span>
                                      <span className={`${isUnderBest ? 'text-green-600 font-bold' : 'text-gray-600'}`}>
                                        u{formatOdds(odds.under)}
                                      </span>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-[11px] md:text-sm text-gray-400">-</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}