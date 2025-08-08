// src/components/TeamAnalysis.tsx
import { useEffect, useState } from 'react';
import { FEITeamData, fetchFEIData, getTeamFEIData, formatFEIValue, getTeamLogoName, calculateExpectedScore, ScoreProjection } from '@/lib/feiData';

interface TeamAnalysisProps {
  awayTeam: string;
  homeTeam: string;
}

interface BettingInsight {
  type: 'advantage' | 'warning' | 'neutral';
  message: string;
}

// Score Projection Component
const ScoreProjectionDisplay = ({ 
  awayData, 
  homeData 
}: { 
  awayData: FEITeamData; 
  homeData: FEITeamData;
}) => {
  const projection = calculateExpectedScore(awayData, homeData);
  
  // Determine insights based on projection
  const getInsights = () => {
    const insights = [];
    
    // Pace insight
    if (projection.possessions > 23) {
      insights.push({ icon: '⚡', text: 'Fast-paced game expected' });
    } else if (projection.possessions < 19) {
      insights.push({ icon: '🐌', text: 'Slow, grinding game likely' });
    }
    
    // Total insight
    if (projection.total.expected > 60) {
      insights.push({ icon: '🎯', text: 'Lean OVER - high scoring environment' });
    } else if (projection.total.expected < 45) {
      insights.push({ icon: '🛡️', text: 'Lean UNDER - defensive battle' });
    }
    
    // Spread insight
    if (Math.abs(projection.spread) > 14) {
      insights.push({ icon: '💪', text: 'Large spread justified by efficiency gap' });
    } else if (Math.abs(projection.spread) < 3) {
      insights.push({ icon: '🎲', text: 'True toss-up - take the points' });
    }
    
    return insights;
  };
  
  const insights = getInsights();
  const favoredTeam = projection.spread > 0 ? homeData : awayData;
  
  return (
    <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl shadow-sm border border-purple-100 p-3 md:p-4 mb-4">
      <h4 className="text-xs md:text-sm font-bold text-gray-700 mb-3 text-center uppercase tracking-wider">
        📊 FEI + Possession Score Projection
      </h4>
      
      {/* Score Display */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="text-center bg-white rounded-lg p-2 shadow-sm">
          <div className="text-xs text-gray-600 mb-1">{awayData.team}</div>
          <div className="text-2xl md:text-3xl font-bold text-gray-900">
            {projection.away.expected}
          </div>
          <div className="text-xs text-gray-500">
            ({projection.away.low}-{projection.away.high})
          </div>
          {awayData.possession && (
            <div className="text-xs text-purple-600 mt-1">
              {awayData.possession.ovg.toFixed(1)} OVG | {awayData.possession.npg.toFixed(1)} poss
            </div>
          )}
        </div>
        
        <div className="text-center bg-white rounded-lg p-2 shadow-sm">
          <div className="text-xs text-gray-600 mb-1">{homeData.team}</div>
          <div className="text-2xl md:text-3xl font-bold text-gray-900">
            {projection.home.expected}
          </div>
          <div className="text-xs text-gray-500">
            ({projection.home.low}-{projection.home.high})
          </div>
          {homeData.possession && (
            <div className="text-xs text-purple-600 mt-1">
              {homeData.possession.ovg.toFixed(1)} OVG | {homeData.possession.npg.toFixed(1)} poss
            </div>
          )}
        </div>
      </div>
      
      {/* Key Metrics */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-white rounded-lg p-2 text-center">
          <div className="text-xs text-gray-600">Total</div>
          <div className="font-bold text-lg text-purple-700">
            {projection.total.expected}
          </div>
          <div className="text-xs text-gray-500">
            ({projection.total.low}-{projection.total.high})
          </div>
        </div>
        
        <div className="bg-white rounded-lg p-2 text-center">
          <div className="text-xs text-gray-600">Spread</div>
          <div className="font-bold text-lg text-purple-700">
            {favoredTeam.team}
          </div>
          <div className="text-xs text-gray-500">
            -{Math.abs(projection.spread).toFixed(1)}
          </div>
        </div>
        
        <div className="bg-white rounded-lg p-2 text-center">
          <div className="text-xs text-gray-600">Possessions</div>
          <div className="font-bold text-lg text-purple-700">
            {projection.possessions}
          </div>
          <div className="text-xs text-gray-500">
            per team
          </div>
        </div>
      </div>
      
      {/* Confidence Level */}
      <div className="bg-white rounded-lg p-2 mb-3 text-center">
        <span className="text-xs text-gray-600 mr-2">Projection Confidence:</span>
        <span className={`font-bold text-sm ${
          projection.confidence === 'Very High' ? 'text-green-600' :
          projection.confidence === 'High' ? 'text-green-500' :
          projection.confidence === 'Moderate' ? 'text-yellow-600' :
          'text-orange-500'
        }`}>
          {projection.confidence}
        </span>
      </div>
      
      {/* Insights */}
      {insights.length > 0 && (
        <div className="space-y-1">
          {insights.map((insight, idx) => (
            <div key={idx} className="bg-purple-100 rounded-lg p-2 text-xs flex items-center">
              <span className="mr-2 text-lg">{insight.icon}</span>
              <span className="text-purple-800 font-medium">{insight.text}</span>
            </div>
          ))}
        </div>
      )}
      
      {/* Data Quality Indicator */}
      {(!awayData.possession || !homeData.possession) && (
        <div className="mt-2 text-xs text-center text-orange-600 bg-orange-50 rounded p-1">
          ⚠️ Using FEI-only projection (possession data unavailable)
        </div>
      )}
      
      {/* Methodology Note */}
      <div className="mt-3 text-xs text-center text-gray-500 italic">
        Combines opponent-adjusted FEI with actual possession efficiency data
      </div>
    </div>
  );
};

export default function TeamAnalysis({ awayTeam, homeTeam }: TeamAnalysisProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [awayData, setAwayData] = useState<FEITeamData | null>(null);
  const [homeData, setHomeData] = useState<FEITeamData | null>(null);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

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

  // Close tooltip on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.tooltip-container')) {
        setActiveTooltip(null);
      }
    };

    if (activeTooltip) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [activeTooltip]);

  // Generate betting insights based on FEI data - REFINED VERSION
  const generateInsights = (away: FEITeamData, home: FEITeamData): BettingInsight[] => {
    const insights: BettingInsight[] = [];
    const feiDiff = away.fei - home.fei;

    // 1. Overall matchup assessment (always provide one)
    if (Math.abs(feiDiff) > 1.0) {
      const strongerTeam = feiDiff > 0 ? away.team : home.team;
      const weakerTeam = feiDiff > 0 ? home.team : away.team;
      const strongerRank = feiDiff > 0 ? away.rank : home.rank;
      const weakerRank = feiDiff > 0 ? home.rank : away.rank;
      
      insights.push({
        type: 'advantage',
        message: `🔥 MASSIVE MISMATCH: ${strongerTeam} (#${strongerRank}) has an enormous efficiency edge over ${weakerTeam} (#${weakerRank}). ${Math.abs(feiDiff).toFixed(2)} FEI gap suggests a 14+ point spread is justified.`
      });
    } else if (Math.abs(feiDiff) > 0.5) {
      const strongerTeam = feiDiff > 0 ? away.team : home.team;
      insights.push({
        type: 'advantage',
        message: `Strong Edge: ${strongerTeam} has significant possession efficiency advantage (${Math.abs(feiDiff).toFixed(2)} FEI gap). Look for them to control the game - consider if getting points.`
      });
    } else if (Math.abs(feiDiff) > 0.25) {
      const strongerTeam = feiDiff > 0 ? away.team : home.team;
      insights.push({
        type: 'neutral',
        message: `Slight Edge: ${strongerTeam} has modest efficiency advantage (${Math.abs(feiDiff).toFixed(2)} FEI). Could be closer than spread suggests if it's 7+ points.`
      });
    } else {
      insights.push({
        type: 'neutral',
        message: `Dead Even: Nearly identical efficiency ratings (${Math.abs(feiDiff).toFixed(2)} FEI difference). True coin flip - grab the points with either team.`
      });
    }
    
    // 2. Offense vs Defense mismatches - what they mean for scoring
    const awayOvsHomeD = away.ofei - home.dfei;
    const homeOvsAwayD = home.ofei - away.dfei;
    
    if (awayOvsHomeD > 1.0) {
      insights.push({
        type: 'advantage',
        message: `💥 ${away.team}'s offense (#${away.ofeiRank}) will DOMINATE ${home.team}'s defense (#${home.dfeiRank}). Expect explosive plays and 30+ points from ${away.team}.`
      });
    } else if (awayOvsHomeD > 0.5) {
      insights.push({
        type: 'advantage',
        message: `📈 ${away.team}'s offense has clear advantage vs ${home.team}'s defense. Should sustain drives and score efficiently - lean OVER.`
      });
    } else if (awayOvsHomeD < -0.8) {
      insights.push({
        type: 'warning',
        message: `🔒 ${home.team}'s defense (#${home.dfeiRank}) will shut down ${away.team}'s offense (#${away.ofeiRank}). Expect lots of punts and field position battle.`
      });
    }
    
    if (homeOvsAwayD > 1.0) {
      insights.push({
        type: 'advantage',
        message: `💥 ${home.team}'s offense (#${home.ofeiRank}) will DOMINATE ${away.team}'s defense (#${away.dfeiRank}). Expect explosive plays and 30+ points from ${home.team}.`
      });
    } else if (homeOvsAwayD > 0.5) {
      insights.push({
        type: 'advantage',
        message: `📈 ${home.team}'s offense has clear advantage vs ${away.team}'s defense. Should sustain drives and score efficiently - lean OVER.`
      });
    } else if (homeOvsAwayD < -0.8) {
      insights.push({
        type: 'warning',
        message: `🔒 ${away.team}'s defense (#${away.dfeiRank}) will shut down ${home.team}'s offense (#${home.ofeiRank}). Expect lots of punts and field position battle.`
      });
    }
    
    // 3. Elite units vs terrible units - extreme disparities
    if (away.ofeiRank <= 10 && home.dfeiRank >= 100) {
      insights.push({
        type: 'advantage',
        message: `🎯 SMASH SPOT: Elite offense (${away.team} #${away.ofeiRank}) vs horrible defense (${home.team} #${home.dfeiRank}). ${away.team} team total OVER is the play.`
      });
    }
    if (home.ofeiRank <= 10 && away.dfeiRank >= 100) {
      insights.push({
        type: 'advantage',
        message: `🎯 SMASH SPOT: Elite offense (${home.team} #${home.ofeiRank}) vs horrible defense (${away.team} #${away.dfeiRank}). ${home.team} team total OVER is the play.`
      });
    }
    
    // 4. Scoring environment based on actual efficiency, not just rankings
    const totalOffenseStrength = away.ofei + home.ofei;
    const totalDefenseStrength = away.dfei + home.dfei;
    const scoringEnvironment = totalOffenseStrength - totalDefenseStrength;
    
    if (scoringEnvironment > 1.0) {
      insights.push({
        type: 'advantage',
        message: `🎰 SHOOTOUT ALERT: Combined offensive efficiency far exceeds defensive efficiency (${scoringEnvironment.toFixed(2)} net). Both teams will score at will - HAMMER the OVER.`
      });
    } else if (scoringEnvironment > 0.5) {
      insights.push({
        type: 'neutral',
        message: `📊 Offense-Friendly: Offenses have efficiency edge (${scoringEnvironment.toFixed(2)} net). Lean toward OVER if total is reasonable.`
      });
    } else if (scoringEnvironment < -1.0) {
      insights.push({
        type: 'warning',
        message: `🏰 DEFENSIVE STRUGGLE: Defenses dominate efficiency matchup (${Math.abs(scoringEnvironment).toFixed(2)} net). Could be ugly - strong UNDER play.`
      });
    } else if (scoringEnvironment < -0.5) {
      insights.push({
        type: 'warning',
        message: `🛡️ Defense-Friendly: Defensive efficiency exceeds offensive (${Math.abs(scoringEnvironment).toFixed(2)} net). Lean UNDER if total seems high.`
      });
    }
    
    // 5. Special teams can swing close games
    const sfeiDiff = away.sfei - home.sfei;
    if (Math.abs(sfeiDiff) > 0.15) {
      const betterST = sfeiDiff > 0 ? away.team : home.team;
      const worseSTRank = sfeiDiff > 0 ? home.sfeiRank : away.sfeiRank;
      insights.push({
        type: 'advantage',
        message: `⚡ HUGE special teams edge to ${betterST}. Opponent ranked #${worseSTRank} - expect short fields and hidden points worth 4-7 point swing.`
      });
    } else if (Math.abs(sfeiDiff) > 0.08) {
      const betterST = sfeiDiff > 0 ? away.team : home.team;
      const stRank = sfeiDiff > 0 ? away.sfeiRank : home.sfeiRank;
      insights.push({
        type: 'neutral',
        message: `⚡ Special teams favor ${betterST} (#${stRank}). Worth 3-4 points in a close game - factor this into spread analysis.`
      });
    }
    
    // 6. Quality assessment - are these good teams or bad teams?
    const avgRank = (away.rank + home.rank) / 2;
    if (avgRank <= 25) {
      if (!insights.some(i => i.message.includes('playoff') || i.message.includes('ranked'))) {
        insights.push({
          type: 'neutral',
          message: `🏆 High-Level Game: Both teams are Top 25 caliber. Execution and coaching matter more than talent - look for live betting opportunities.`
        });
      }
    } else if (avgRank >= 90) {
      insights.push({
        type: 'warning',
        message: `⚠️ Caution: Both teams rank 90+ overall. High variance expected - weird things happen in bad football games. Consider staying away.`
      });
    }
    
    // 7. Consistency vs Inconsistency - properly defined
    const awayVariance = Math.abs(away.ofeiRank - away.dfeiRank);
    const homeVariance = Math.abs(home.ofeiRank - home.dfeiRank);
    
    // Only call a team "consistent" if they're actually good at both or bad at both with low variance
    if (awayVariance < 15 && away.rank <= 40) {
      if (homeVariance > 50) {
        insights.push({
          type: 'neutral',
          message: `📊 ${away.team} is elite on both sides (Off #${away.ofeiRank}/Def #${away.dfeiRank}) while ${home.team} is wildly inconsistent. Trust the complete team.`
        });
      }
    } else if (homeVariance < 15 && home.rank <= 40) {
      if (awayVariance > 50) {
        insights.push({
          type: 'neutral',
          message: `📊 ${home.team} is elite on both sides (Off #${home.ofeiRank}/Def #${home.dfeiRank}) while ${away.team} is wildly inconsistent. Trust the complete team.`
        });
      }
    }
    
    // Identify one-dimensional teams
    if (away.ofeiRank <= 25 && away.dfeiRank >= 80) {
      insights.push({
        type: 'warning',
        message: `🎲 ${away.team} is all offense (#${away.ofeiRank}) with no defense (#${away.dfeiRank}). High variance - they'll either win big or lose big.`
      });
    } else if (away.dfeiRank <= 25 && away.ofeiRank >= 80) {
      insights.push({
        type: 'warning',
        message: `🛡️ ${away.team} is all defense (#${away.dfeiRank}) with no offense (#${away.ofeiRank}). Need to win ugly - UNDER has value.`
      });
    }
    
    if (home.ofeiRank <= 25 && home.dfeiRank >= 80) {
      insights.push({
        type: 'warning',
        message: `🎲 ${home.team} is all offense (#${home.ofeiRank}) with no defense (#${home.dfeiRank}). High variance - they'll either win big or lose big.`
      });
    } else if (home.dfeiRank <= 25 && home.ofeiRank >= 80) {
      insights.push({
        type: 'warning',
        message: `🛡️ ${home.team} is all defense (#${home.dfeiRank}) with no offense (#${home.ofeiRank}). Need to win ugly - UNDER has value.`
      });
    }
    
    // 8. Home field advantage in close matchups
    if (Math.abs(feiDiff) < 0.3) {
      const homeFieldValue = 0.15; // Approximate FEI value of home field
      const adjustedDiff = feiDiff + homeFieldValue; // Adjust for home team
      
      if (adjustedDiff > 0) {
        insights.push({
          type: 'neutral',
          message: `🏟️ Close matchup flips with home field: ${home.team} gets ~3 points for home advantage, making them the efficiency favorite. Take the home dog if getting points.`
        });
      } else {
        insights.push({
          type: 'neutral',
          message: `🏟️ ${home.team}'s home field advantage (worth ~3 points) makes this a true toss-up. Slight lean to home team if line is pick 'em.`
        });
      }
    }
    
    // 9. Travel and road warrior analysis
    if (away.rank <= 15 && away.ofei > 0.5) {
      insights.push({
        type: 'advantage',
        message: `✈️ ${away.team} (#${away.rank}) has elite offense that travels well. Don't be scared laying road points with efficiency this good.`
      });
    }
    
    // 10. Red zone and scoring efficiency implications
    if (away.ofei > 0.3 && home.dfei < -0.3) {
      if (!insights.some(i => i.message.includes('red zone'))) {
        insights.push({
          type: 'neutral',
          message: `🎯 ${away.team} should dominate red zone against ${home.team}'s weak D. Expect TDs not FGs - good for ${away.team} team total OVER.`
        });
      }
    }
    if (home.ofei > 0.3 && away.dfei < -0.3) {
      if (!insights.some(i => i.message.includes('red zone'))) {
        insights.push({
          type: 'neutral',
          message: `🎯 ${home.team} should dominate red zone against ${away.team}'s weak D. Expect TDs not FGs - good for ${home.team} team total OVER.`
        });
      }
    }
    
    // 11. Ensure minimum insights with valuable context
    if (insights.length < 3) {
      // Add pace and possession insights
      if (away.ofei > 0 && home.ofei > 0) {
        insights.push({
          type: 'neutral',
          message: `⏱️ Both teams have positive offensive efficiency. More possessions = more scoring opportunities. Slight OVER lean in up-tempo game.`
        });
      } else if (away.ofei < -0.2 && home.ofei < -0.2) {
        insights.push({
          type: 'warning',
          message: `🐌 Both offenses struggle with efficiency. Expect long, grinding drives that eat clock and limit possessions. UNDER has value.`
        });
      }
      
      // Market efficiency angle
      const publicSide = Math.abs(feiDiff) > 0.3 ? (feiDiff > 0 ? away.team : home.team) : null;
      if (publicSide && insights.length < 4) {
        const otherTeam = publicSide === away.team ? home.team : away.team;
        insights.push({
          type: 'warning',
          message: `💰 FEI suggests ${publicSide} is better, but if line doesn't reflect full gap, ${otherTeam} may offer contrarian value. Shop for best number.`
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

  // Metric explanations
  const metricExplanations = {
    fei: {
      title: "Overall FEI",
      description: "Opponent-adjusted efficiency measuring expected scoring advantage per possession against an average team. Combines offense, defense, and special teams.",
      interpretation: "Higher is better • 0.0 = average • Elite > 0.5 • Poor < -0.3"
    },
    ofei: {
      title: "Offensive FEI", 
      description: "Opponent-adjusted scoring efficiency per offensive possession. Measures how many points above/below average an offense generates per drive.",
      interpretation: "Higher is better • 0.0 = average • Elite > 0.4 • Poor < -0.2"
    },
    dfei: {
      title: "Defensive FEI",
      description: "Opponent-adjusted defensive efficiency per possession. Measures how many points below/above average a defense allows per drive.",
      interpretation: "Higher is better • 0.0 = average • Elite > 0.4 • Poor < -0.2"
    },
    sfei: {
      title: "Special Teams FEI",
      description: "Measures field position value generated by special teams units including kickoffs, punts, returns, and field goals.",
      interpretation: "Higher is better • 0.0 = average • Elite > 0.08 • Poor < -0.05"
    }
  };

  const InfoIcon = ({ metric }: { metric: string }) => (
    <div className="relative inline-block ml-1 tooltip-container">
      <button
        onClick={() => setActiveTooltip(activeTooltip === metric ? null : metric)}
        className="inline-flex items-center justify-center w-4 h-4 text-xs rounded-full bg-amber-200 text-amber-800 hover:bg-amber-300 transition-colors"
        aria-label={`Information about ${metric}`}
      >
        i
      </button>
      {activeTooltip === metric && (
        <div className="absolute z-10 w-64 p-3 mt-1 text-xs bg-white rounded-lg shadow-xl border border-amber-200 left-1/2 transform -translate-x-1/2 md:left-auto md:right-0 md:transform-none">
          <button
            onClick={() => setActiveTooltip(null)}
            className="absolute top-1 right-1 text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            ×
          </button>
          <div className="font-bold text-amber-900 mb-1">
            {metricExplanations[metric as keyof typeof metricExplanations].title}
          </div>
          <div className="text-gray-700 mb-2">
            {metricExplanations[metric as keyof typeof metricExplanations].description}
          </div>
          <div className="text-amber-800 font-medium text-xs">
            {metricExplanations[metric as keyof typeof metricExplanations].interpretation}
          </div>
        </div>
      )}
    </div>
  );

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

      {/* Score Projection Component */}
      <ScoreProjectionDisplay awayData={awayData} homeData={homeData} />

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

      {/* Main Efficiency Ratings - Mobile Optimized */}
      <div className="space-y-3 md:space-y-4 mb-4 md:mb-6">
        <div className="bg-gradient-to-br from-gray-100 to-gray-50 rounded-xl shadow-sm border border-gray-200 p-3 md:p-4">
          <h4 className="text-xs md:text-sm font-bold text-gray-700 mb-3 md:mb-4 text-center uppercase tracking-wider">Efficiency Ratings</h4>
          
          {/* Overall FEI */}
          <div className="bg-white rounded-lg p-2 mb-2 md:mb-3 shadow-sm">
            <div className="grid grid-cols-3 gap-1 md:gap-2 items-center">
              <div className={`text-right text-sm md:text-base ${feiColors.away}`}>
                <span className="block md:inline">{formatFEIValue(awayData.fei)}</span>
                <span className="text-xs text-gray-400 block md:inline md:ml-1">#{awayData.rank}</span>
              </div>
              <div className="text-center">
                <div className="text-xs md:text-sm font-medium text-gray-900 flex items-center justify-center">
                  Overall
                  <InfoIcon metric="fei" />
                </div>
                <div className="text-xs text-gray-500">FEI</div>
              </div>
              <div className={`text-left text-sm md:text-base ${feiColors.home}`}>
                <span className="block md:inline">{formatFEIValue(homeData.fei)}</span>
                <span className="text-xs text-gray-400 block md:inline md:ml-1">#{homeData.rank}</span>
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
                <div className="text-xs md:text-sm font-medium text-gray-900 flex items-center justify-center">
                  Offense
                  <InfoIcon metric="ofei" />
                </div>
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
                <div className="text-xs md:text-sm font-medium text-gray-900 flex items-center justify-center">
                  Defense
                  <InfoIcon metric="dfei" />
                </div>
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
                <div className="text-xs md:text-sm font-medium text-gray-900 flex items-center justify-center">
                  Special Teams
                  <InfoIcon metric="sfei" />
                </div>
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
        <p className="font-medium">Higher FEI values = better efficiency • Rankings shown as #</p>
        <p className="mt-1">
          <span className="text-emerald-600 font-bold">Green</span> = Advantage 
          <span className="text-rose-500 ml-2">Red</span> = Disadvantage
        </p>
      </div>
    </div>
  );
}