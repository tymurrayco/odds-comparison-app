// src/components/TeamAnalysis.tsx
import { useEffect, useState } from 'react';
import { FEITeamData, fetchFEIData, getTeamFEIData, formatFEIValue, getTeamLogoName } from '@/lib/feiData';

interface TeamAnalysisProps {
  awayTeam: string;
  homeTeam: string;
}

interface BettingInsight {
  type: 'advantage' | 'warning' | 'neutral';
  message: string;
}

export default function TeamAnalysis({ awayTeam, homeTeam }: TeamAnalysisProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [awayData, setAwayData] = useState<FEITeamData | null>(null);
  const [homeData, setHomeData] = useState<FEITeamData | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const feiData = await fetchFEIData();
        
        const away = getTeamFEIData(awayTeam, feiData);
        const home = getTeamFEIData(homeTeam, feiData);
        
        if (!away || !home) {
          setError(`Could not find FEI data for ${!away ? awayTeam : ''} ${!away && !home ? 'and' : ''} ${!home ? homeTeam : ''}`);
        }
        
        setAwayData(away);
        setHomeData(home);
      } catch (err) {
        console.error('Error loading FEI data:', err);
        setError('Failed to load analysis data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [awayTeam, homeTeam]);

  // Generate betting insights based on FEI data - ENHANCED VERSION
  const generateInsights = (away: FEITeamData, home: FEITeamData): BettingInsight[] => {
    const insights: BettingInsight[] = [];
    const feiDiff = away.fei - home.fei;
    const ofeiDiff = away.ofei - home.ofei;
    const dfeiDiff = away.dfei - home.dfei;
    
    // 1. Overall matchup assessment (always provide one)
    if (Math.abs(feiDiff) > 1.0) {
      const strongerTeam = feiDiff > 0 ? away.team : home.team;
      const weakerTeam = feiDiff > 0 ? home.team : away.team;
      insights.push({
        type: 'advantage',
        message: `🔥 MASSIVE ADVANTAGE: ${strongerTeam} has an elite edge (${Math.abs(feiDiff).toFixed(2)} FEI gap). Expect a potential blowout.`
      });
    } else if (Math.abs(feiDiff) > 0.5) {
      const strongerTeam = feiDiff > 0 ? away.team : home.team;
      insights.push({
        type: 'advantage',
        message: `Strong Edge: ${strongerTeam} has a significant advantage (${Math.abs(feiDiff).toFixed(2)} FEI). Consider them if getting points or giving less than 10.`
      });
    } else if (Math.abs(feiDiff) > 0.25) {
      const strongerTeam = feiDiff > 0 ? away.team : home.team;
      insights.push({
        type: 'neutral',
        message: `Slight Edge: ${strongerTeam} has a modest advantage (${Math.abs(feiDiff).toFixed(2)} FEI). Could be closer than the spread suggests.`
      });
    } else {
      insights.push({
        type: 'neutral',
        message: `Toss-up Game: Very evenly matched teams (${Math.abs(feiDiff).toFixed(2)} FEI difference). Look for value on the underdog with the points.`
      });
    }
    
    // 2. Offense vs Defense mismatches
    const awayOvsHomeD = away.ofei - home.dfei;
    const homeOvsAwayD = home.ofei - away.dfei;
    
    if (awayOvsHomeD > 0.8) {
      insights.push({
        type: 'advantage',
        message: `📈 ${away.team}'s offense (#${away.ofeiRank}) has a huge edge over ${home.team}'s defense (#${home.dfeiRank}). Strong OVER lean.`
      });
    } else if (awayOvsHomeD > 0.4) {
      insights.push({
        type: 'advantage',
        message: `📊 ${away.team}'s offense should find success against ${home.team}'s defense. Consider the OVER if total looks low.`
      });
    }
    
    if (homeOvsAwayD > 0.8) {
      insights.push({
        type: 'advantage',
        message: `📈 ${home.team}'s offense (#${home.ofeiRank}) has a huge edge over ${away.team}'s defense (#${away.dfeiRank}). Strong OVER lean.`
      });
    } else if (homeOvsAwayD > 0.4) {
      insights.push({
        type: 'advantage',
        message: `📊 ${home.team}'s offense should find success against ${away.team}'s defense. Consider the OVER if total looks low.`
      });
    }
    
    // 3. Defensive battles or offensive shootouts
    if (away.dfei > 0.4 && home.dfei > 0.4) {
      insights.push({
        type: 'warning',
        message: `🛡️ Defensive Battle: Both teams have elite defenses (Top ${Math.max(away.dfeiRank, home.dfeiRank)} nationally). Strong UNDER play.`
      });
    } else if (away.dfei < -0.3 && home.dfei < -0.3) {
      insights.push({
        type: 'warning',
        message: `🎯 Shootout Alert: Both defenses struggle (${away.team} #${away.dfeiRank}, ${home.team} #${home.dfeiRank}). Hammer the OVER.`
      });
    }
    
    // 4. Special teams edge (lower threshold to catch more games)
    const sfeiDiff = Math.abs(away.sfei - home.sfei);
    if (sfeiDiff > 0.08) {
      const betterST = away.sfei > home.sfei ? away.team : home.team;
      const stRank = away.sfei > home.sfei ? away.sfeiRank : home.sfeiRank;
      insights.push({
        type: 'neutral',
        message: `⚡ Special teams edge to ${betterST} (#${stRank}). Could be decisive in a close game or provide hidden value.`
      });
    } else if (sfeiDiff > 0.04) {
      const betterST = away.sfei > home.sfei ? away.team : home.team;
      insights.push({
        type: 'neutral',
        message: `Special teams slightly favor ${betterST}. Worth considering in a pick 'em situation.`
      });
    }
    
    // 5. Extreme rankings mismatches
    if ((away.rank <= 10 && home.rank >= 40) || (home.rank <= 10 && away.rank >= 40)) {
      const favorite = away.rank <= 10 ? away.team : home.team;
      const underdog = away.rank <= 10 ? home.team : away.team;
      const rankDiff = Math.abs(away.rank - home.rank);
      insights.push({
        type: 'advantage',
        message: `⚠️ Talent Gap: ${favorite} (Top ${Math.min(away.rank, home.rank)}) vs ${underdog} (#${Math.max(away.rank, home.rank)}). ${rankDiff}+ spot ranking difference usually means double-digit spread is justified.`
      });
    }
    
    // 6. Pace and scoring environment insights (always add at least one)
    const totalOffenseStrength = away.ofei + home.ofei;
    const totalDefenseStrength = away.dfei + home.dfei;
    const scoringEnvironment = totalOffenseStrength - totalDefenseStrength;
    
    if (insights.filter(i => i.message.includes('OVER') || i.message.includes('UNDER')).length === 0) {
      if (scoringEnvironment > 0.5) {
        insights.push({
          type: 'neutral',
          message: `💰 Scoring Environment: Offenses outmatch defenses (${scoringEnvironment.toFixed(2)} net). Lean toward the OVER.`
        });
      } else if (scoringEnvironment < -0.5) {
        insights.push({
          type: 'neutral',
          message: `🔒 Low-Scoring Environment: Defenses outmatch offenses (${Math.abs(scoringEnvironment).toFixed(2)} net). Lean toward the UNDER.`
        });
      } else {
        insights.push({
          type: 'neutral',
          message: `📊 Balanced Matchup: Offense and defense strengths offset. Total should be properly set by the market.`
        });
      }
    }
    
    // 7. Home field consideration (if metrics are close)
    if (Math.abs(feiDiff) < 0.3 && !insights.some(i => i.message.includes('home'))) {
      insights.push({
        type: 'neutral',
        message: `🏟️ Home Field Factor: In a close matchup, ${home.team}'s home advantage could be the difference. Consider them getting points.`
      });
    }
    
    // 8. Consistency/Volatility insight based on ranking gaps between units
    const awayConsistency = Math.abs(away.ofeiRank - away.dfeiRank);
    const homeConsistency = Math.abs(home.ofeiRank - home.dfeiRank);
    
    if (awayConsistency < 15 && homeConsistency > 40) {
      insights.push({
        type: 'neutral',
        message: `📈 ${away.team} is more balanced (Off #${away.ofeiRank}/Def #${away.dfeiRank}) vs ${home.team}'s volatility. Favor consistency in close spreads.`
      });
    } else if (homeConsistency < 15 && awayConsistency > 40) {
      insights.push({
        type: 'neutral',
        message: `📈 ${home.team} is more balanced (Off #${home.ofeiRank}/Def #${home.dfeiRank}) vs ${away.team}'s volatility. Favor consistency in close spreads.`
      });
    }
    
    // 9. Strength of strength - when a team is good at what matters most
    if (away.ofei > 0.6 && away.ofeiRank <= 15) {
      if (!insights.some(i => i.message.includes(`${away.team}'s offense`))) {
        insights.push({
          type: 'advantage',
          message: `🎯 ${away.team} has an elite offense (#${away.ofeiRank}) that travels well. Trust them on the road.`
        });
      }
    }
    if (home.dfei > 0.6 && home.dfeiRank <= 15) {
      if (!insights.some(i => i.message.includes(`${home.team}'s defense`))) {
        insights.push({
          type: 'advantage',
          message: `🏰 ${home.team}'s elite defense (#${home.dfeiRank}) at home is a fortress. Tough environment for ${away.team}.`
        });
      }
    }
    
    // 10. Guarantee at least 2-3 meaningful insights
    if (insights.length < 2) {
      // Add a trend-based insight
      if (away.rank < home.rank) {
        insights.push({
          type: 'neutral',
          message: `📊 Ranking Edge: ${away.team} (#${away.rank}) is the better overall team vs ${home.team} (#${home.rank}). Road favorites often provide value.`
        });
      } else {
        insights.push({
          type: 'neutral',
          message: `📊 Home Team Quality: ${home.team} (#${home.rank}) has a slight overall edge vs ${away.team} (#${away.rank}). Home favorites tend to cover at a higher rate.`
        });
      }
    }
    
    // 11. Add a contrarian angle if we still need insights
    if (insights.length < 3) {
      const publicSide = feiDiff > 0.2 ? away.team : (feiDiff < -0.2 ? home.team : null);
      if (publicSide) {
        const otherTeam = publicSide === away.team ? home.team : away.team;
        insights.push({
          type: 'warning',
          message: `🎲 Contrarian Angle: If public heavily backing ${publicSide}, consider ${otherTeam} for value. Markets often overadjust to FEI gaps.`
        });
      } else {
        insights.push({
          type: 'neutral',
          message: `🎲 Market Efficiency: This even matchup likely has a sharp line. Look for live betting opportunities after seeing early game flow.`
        });
      }
    }
    
    return insights;
  };

  // Get team logo path
  const getTeamLogo = (teamName: string) => {
    const logoName = getTeamLogoName(teamName);
    return `/team-logos/${logoName}.png`;
  };

  if (loading) {
    return (
      <div className="p-4 md:p-6 text-center">
        <div className="inline-block animate-spin rounded-full h-6 w-6 md:h-8 md:w-8 border-b-2 border-gray-900"></div>
        <p className="mt-2 text-xs md:text-sm text-gray-600">Loading analysis data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 md:p-6 text-center text-red-600 text-xs md:text-sm">
        {error}
      </div>
    );
  }

  if (!awayData || !homeData) {
    return null;
  }

  const insights = generateInsights(awayData, homeData);
  
  // Determine which team has the advantage in each category
  const getAdvantageColor = (awayValue: number, homeValue: number, higherIsBetter: boolean = true) => {
    const diff = Math.abs(awayValue - homeValue);
    const threshold = 0.1; // Minimum difference to show advantage
    
    if (diff < threshold) {
      return { away: 'text-gray-700', home: 'text-gray-700' };
    }
    
    if (higherIsBetter) {
      if (awayValue > homeValue) return { away: 'text-emerald-600 font-bold', home: 'text-rose-500' };
      if (homeValue > awayValue) return { away: 'text-rose-500', home: 'text-emerald-600 font-bold' };
    } else {
      if (awayValue < homeValue) return { away: 'text-emerald-600 font-bold', home: 'text-rose-500' };
      if (homeValue < awayValue) return { away: 'text-rose-500', home: 'text-emerald-600 font-bold' };
    }
    return { away: 'text-gray-700', home: 'text-gray-700' };
  };

  const feiColors = getAdvantageColor(awayData.fei, homeData.fei);
  const ofeiColors = getAdvantageColor(awayData.ofei, homeData.ofei);
  const dfeiColors = getAdvantageColor(awayData.dfei, homeData.dfei);
  const sfeiColors = getAdvantageColor(awayData.sfei, homeData.sfei);

  return (
    <div className="p-3 md:p-4">
      {/* Betting Insights Section */}
      {insights.length > 0 && (
        <div className="mb-4 md:mb-6 space-y-2">
          <h4 className="text-xs md:text-sm font-bold text-gray-700 mb-2 uppercase tracking-wider">💡 Betting Angles</h4>
          {insights.map((insight, index) => (
            <div 
              key={index}
              className={`p-2 md:p-3 rounded-lg text-xs md:text-sm shadow-sm ${
                insight.type === 'advantage' 
                  ? 'bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 text-emerald-800'
                  : insight.type === 'warning'
                  ? 'bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 text-amber-800'
                  : 'bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 text-blue-800'
              }`}
            >
              {insight.message}
            </div>
          ))}
        </div>
      )}
      
      {/* Team Headers with Logos - Mobile Optimized */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-4 mb-4 md:mb-6">
        <div className="text-center">
          <div className="flex flex-col items-center">
            <img 
              src={getTeamLogo(awayData.team)}
              alt={awayData.team}
              className="h-12 w-12 md:h-16 md:w-16 mb-1 md:mb-2"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <h3 className="font-semibold text-sm md:text-lg">{awayData.team}</h3>
            <p className="text-xs md:text-sm text-gray-600">#{awayData.rank} Overall</p>
          </div>
        </div>
        <div className="hidden md:flex text-center text-gray-500 text-sm items-center justify-center">
          VS
        </div>
        <div className="text-center">
          <div className="flex flex-col items-center">
            <img 
              src={getTeamLogo(homeData.team)}
              alt={homeData.team}
              className="h-12 w-12 md:h-16 md:w-16 mb-1 md:mb-2"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <h3 className="font-semibold text-sm md:text-lg">{homeData.team}</h3>
            <p className="text-xs md:text-sm text-gray-600">#{homeData.rank} Overall</p>
          </div>
        </div>
      </div>

      {/* Mobile VS indicator */}
      <div className="md:hidden text-center text-xs text-gray-500 mb-3">
        — VS —
      </div>

      {/* Main Efficiency Ratings - Mobile Optimized */}
      <div className="space-y-3 md:space-y-4 mb-4 md:mb-6">
        <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl shadow-sm border border-gray-100 p-3 md:p-4">
          <h4 className="text-xs md:text-sm font-bold text-gray-700 mb-3 md:mb-4 text-center uppercase tracking-wider">Efficiency Ratings</h4>
          
          {/* Overall FEI */}
          <div className="bg-white rounded-lg p-2 mb-2 md:mb-3 shadow-sm">
            <div className="grid grid-cols-3 gap-1 md:gap-2 items-center">
              <div className={`text-right text-sm md:text-base ${feiColors.away}`}>
                {formatFEIValue(awayData.fei)}
              </div>
              <div className="text-center">
                <div className="text-xs md:text-sm font-medium text-gray-900">Overall</div>
                <div className="text-xs text-gray-500">FEI</div>
              </div>
              <div className={`text-left text-sm md:text-base ${feiColors.home}`}>
                {formatFEIValue(homeData.fei)}
              </div>
            </div>
          </div>

          {/* Offense */}
          <div className="bg-white rounded-lg p-2 mb-2 md:mb-3 shadow-sm">
            <div className="grid grid-cols-3 gap-1 md:gap-2 items-center">
              <div className={`text-right text-sm md:text-base ${ofeiColors.away}`}>
                <span className="block md:inline">{formatFEIValue(awayData.ofei)}</span>
                <span className="text-xs text-gray-400 block md:inline md:ml-1">#{awayData.ofeiRank}</span>
              </div>
              <div className="text-center">
                <div className="text-xs md:text-sm font-medium text-gray-900">Offense</div>
                <div className="text-xs text-gray-500">OFEI</div>
              </div>
              <div className={`text-left text-sm md:text-base ${ofeiColors.home}`}>
                <span className="block md:inline">{formatFEIValue(homeData.ofei)}</span>
                <span className="text-xs text-gray-400 block md:inline md:ml-1">#{homeData.ofeiRank}</span>
              </div>
            </div>
          </div>

          {/* Defense */}
          <div className="bg-white rounded-lg p-2 mb-2 md:mb-3 shadow-sm">
            <div className="grid grid-cols-3 gap-1 md:gap-2 items-center">
              <div className={`text-right text-sm md:text-base ${dfeiColors.away}`}>
                <span className="block md:inline">{formatFEIValue(awayData.dfei)}</span>
                <span className="text-xs text-gray-400 block md:inline md:ml-1">#{awayData.dfeiRank}</span>
              </div>
              <div className="text-center">
                <div className="text-xs md:text-sm font-medium text-gray-900">Defense</div>
                <div className="text-xs text-gray-500">DFEI</div>
              </div>
              <div className={`text-left text-sm md:text-base ${dfeiColors.home}`}>
                <span className="block md:inline">{formatFEIValue(homeData.dfei)}</span>
                <span className="text-xs text-gray-400 block md:inline md:ml-1">#{homeData.dfeiRank}</span>
              </div>
            </div>
          </div>

          {/* Special Teams */}
          <div className="bg-white rounded-lg p-2 shadow-sm">
            <div className="grid grid-cols-3 gap-1 md:gap-2 items-center">
              <div className={`text-right text-sm md:text-base ${sfeiColors.away}`}>
                <span className="block md:inline">{formatFEIValue(awayData.sfei)}</span>
                <span className="text-xs text-gray-400 block md:inline md:ml-1">#{awayData.sfeiRank}</span>
              </div>
              <div className="text-center">
                <div className="text-xs md:text-sm font-medium text-gray-900">Special Teams</div>
                <div className="text-xs text-gray-500">SFEI</div>
              </div>
              <div className={`text-left text-sm md:text-base ${sfeiColors.home}`}>
                <span className="block md:inline">{formatFEIValue(homeData.sfei)}</span>
                <span className="text-xs text-gray-400 block md:inline md:ml-1">#{homeData.sfeiRank}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Matchup Advantages Summary - Mobile Optimized */}
      {(Math.abs(awayData.ofei - homeData.dfei) > 0.5 || Math.abs(homeData.ofei - awayData.dfei) > 0.5) && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl shadow-sm border border-blue-100 p-3 md:p-4 mb-4">
          <h4 className="text-xs md:text-sm font-bold text-gray-700 mb-2 md:mb-3 text-center uppercase tracking-wider">
            🎯 Key Matchup Edges
          </h4>
          <div className="space-y-2">
            {/* Biggest advantage */}
            {Math.abs(awayData.ofei - homeData.dfei) > 0.5 && (
              <div className="bg-white/80 rounded-lg p-2 backdrop-blur-sm">
                <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-1">
                  <span className="text-xs md:text-sm text-gray-600 font-medium">Offense vs Defense</span>
                  <div className="font-semibold text-green-600 text-xs md:text-sm">
                    <span className="font-bold">{awayData.team}</span> O vs {homeData.team} D
                    <span className="block md:inline md:ml-1 text-gray-500"> 
                      ({formatFEIValue(awayData.ofei)} vs {formatFEIValue(homeData.dfei)})
                    </span>
                  </div>
                </div>
              </div>
            )}
            {Math.abs(homeData.ofei - awayData.dfei) > 0.5 && (
              <div className="bg-white/80 rounded-lg p-2 backdrop-blur-sm">
                <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-1">
                  <span className="text-xs md:text-sm text-gray-600 font-medium">Offense vs Defense</span>
                  <div className="font-semibold text-green-600 text-xs md:text-sm">
                    <span className="font-bold">{homeData.team}</span> O vs {awayData.team} D
                    <span className="block md:inline md:ml-1 text-gray-500"> 
                      ({formatFEIValue(homeData.ofei)} vs {formatFEIValue(awayData.dfei)})
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Legend - Mobile Optimized */}
      <div className="mt-4 md:mt-6 text-xs text-gray-500 text-center">
        <p className="font-medium">Higher values = better • Rankings shown as #</p>
        <p className="mt-1">
          <span className="text-emerald-600 font-bold">Green</span> = Advantage 
          <span className="text-rose-500 ml-2">Red</span> = Disadvantage
        </p>
      </div>
    </div>
  );
}