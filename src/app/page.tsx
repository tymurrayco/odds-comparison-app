// src/app/page.tsx (modified with caching and conference filtering)
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchOdds, fetchFutures, Game, FuturesMarket } from '@/lib/api';
import LeagueNav from '@/components/LeagueNav';
import GameCard from '@/components/GameCard';
import FuturesTable from '@/components/FuturesTable';
import ConferenceFilter from '@/components/ConferenceFilter';
import { getTeamConference } from '@/lib/conferences';

interface CacheItem<T> {
  data: T;
  timestamp: number;
  league: string;
}

export default function Home() {
 const [activeLeague, setActiveLeague] = useState('basketball_nba');
 const [activeView, setActiveView] = useState<'games' | 'futures'>('games');
 const [games, setGames] = useState<Game[]>([]);
 const [futures, setFutures] = useState<FuturesMarket[]>([]);
 const [loading, setLoading] = useState(true);
 const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
 const [isClient, setIsClient] = useState(false);
 const [apiRequestsRemaining, setApiRequestsRemaining] = useState<string | null>(null);
 const [teamFilter, setTeamFilter] = useState(''); // Team filter state
 const [selectedConferences, setSelectedConferences] = useState<string[]>([]); // NEW: Conference filter state
 
 // Cache state
 const [gamesCache, setGamesCache] = useState<{ [league: string]: CacheItem<Game[]> }>({});
 const [futuresCache, setFuturesCache] = useState<{ [league: string]: CacheItem<FuturesMarket[]> }>({});
 
 // Cache time in milliseconds (e.g., 5 minutes)
 const CACHE_TIME = 5 * 60 * 1000;
 
 // Define the Masters league ID correctly
 const MASTERS_LEAGUE_ID = 'golf_masters_tournament_winner';

 // Set isClient to true when component mounts on client side
 useEffect(() => {
   setIsClient(true);
   
   // Load saved league from localStorage after client-side hydration
   const savedLeague = localStorage.getItem('activeLeague');
   if (savedLeague) {
     setActiveLeague(savedLeague);
   }
 }, []);

 // Force futures view when Masters is selected
 useEffect(() => {
   if (activeLeague === MASTERS_LEAGUE_ID) {
     setActiveView('futures');
   }
   setTeamFilter(''); // Clear filter when changing leagues
   setSelectedConferences([]); // NEW: Clear conference filter when changing leagues
 }, [activeLeague]);

 // Save to localStorage when activeLeague changes, but only after hydration
 useEffect(() => {
   if (isClient) {
     localStorage.setItem('activeLeague', activeLeague);
   }
 }, [activeLeague, isClient]);

 // Check if data is in cache and still valid
 const isValidCache = <T,>(cache: { [league: string]: CacheItem<T> }, league: string): boolean => {
   if (!cache[league]) return false;
   const now = Date.now();
   return (now - cache[league].timestamp) < CACHE_TIME;
 };

 // Load data from cache or API
 const loadData = useCallback(async function() {
   setLoading(true);
   
   // Add a small delay to prevent rapid successive calls
   await new Promise(resolve => setTimeout(resolve, 100));
   
   const now = Date.now();
   const needsGames = activeView === 'games' && activeLeague !== MASTERS_LEAGUE_ID;
   const needsFutures = activeView === 'futures' || activeLeague === MASTERS_LEAGUE_ID;
   
   try {
     let gamesLoaded = false;
     let futuresLoaded = false;
     
     // Load games if needed
     if (needsGames) {
       if (isValidCache(gamesCache, activeLeague)) {
         // Use cached data
         setGames(gamesCache[activeLeague].data);
         gamesLoaded = true;
       } else {
         // Fetch fresh data
         const response = await fetchOdds(activeLeague);
         setGames(response.data);
         setApiRequestsRemaining(response.requestsRemaining);
         setGamesCache(prev => ({
           ...prev,
           [activeLeague]: { data: response.data, timestamp: now, league: activeLeague }
         }));
         gamesLoaded = true;
       }
     }
     
     // Load futures if needed
     if (needsFutures) {
       if (isValidCache(futuresCache, activeLeague)) {
         // Use cached data
         setFutures(futuresCache[activeLeague].data);
         futuresLoaded = true;
       } else {
         // Fetch fresh data
         const response = await fetchFutures(activeLeague);
         setFutures(response.data);
         setApiRequestsRemaining(response.requestsRemaining);
         setFuturesCache(prev => ({
           ...prev,
           [activeLeague]: { data: response.data, timestamp: now, league: activeLeague }
         }));
         futuresLoaded = true;
       }
     }
     
     if (gamesLoaded || futuresLoaded) {
       setLastUpdated(new Date());
     }
   } catch (error) {
     console.error('Error loading data:', error);
   } finally {
     setLoading(false);
   }
 }, [activeLeague, activeView, gamesCache, futuresCache, isValidCache]);

 // Force reload with fresh data (for refresh button)
 const forceRefresh = useCallback(async function() {
   setLoading(true);
   
   try {
     const now = Date.now();
     
     // Load based on the current view and league
     if (activeView === 'games' && activeLeague !== MASTERS_LEAGUE_ID) {
       const response = await fetchOdds(activeLeague);
       setGames(response.data);
       setApiRequestsRemaining(response.requestsRemaining);
       setGamesCache(prev => ({
         ...prev,
         [activeLeague]: { data: response.data, timestamp: now, league: activeLeague }
       }));
     } else {
       const response = await fetchFutures(activeLeague);
       setFutures(response.data);
       setApiRequestsRemaining(response.requestsRemaining);
       setFuturesCache(prev => ({
         ...prev,
         [activeLeague]: { data: response.data, timestamp: now, league: activeLeague }
       }));
     }
     
     setLastUpdated(new Date());
   } catch (error) {
     console.error('Error refreshing data:', error);
   } finally {
     setLoading(false);
   }
 }, [activeLeague, activeView]);
 
 // Load data when league or view changes
 useEffect(() => {
   loadData();
 }, [loadData]);

 // Force the effective view for rendering
 const effectiveView = activeLeague === MASTERS_LEAGUE_ID ? 'futures' : activeView;

 // UPDATED: Filter games based on team name AND conferences
 const filteredGames = useMemo(() => {
   let filtered = games;

   // Filter by team name
   if (teamFilter.trim()) {
     const searchTerm = teamFilter.toLowerCase().trim();
     filtered = filtered.filter(game => 
       game.home_team.toLowerCase().includes(searchTerm) || 
       game.away_team.toLowerCase().includes(searchTerm)
     );
   }

   // Filter by conference if any are selected
   if (selectedConferences.length > 0) {
     filtered = filtered.filter(game => {
       const homeConference = getTeamConference(activeLeague, game.home_team);
       const awayConference = getTeamConference(activeLeague, game.away_team);
       
       // Show game if either team is in a selected conference
       return (homeConference && selectedConferences.includes(homeConference)) ||
              (awayConference && selectedConferences.includes(awayConference));
     });
   }

   return filtered;
 }, [games, teamFilter, selectedConferences, activeLeague]);

 // Filter futures based on team/player name
 const filteredFutures = futures.map(market => ({
   ...market,
   teams: market.teams.filter(team => {
     if (!teamFilter.trim()) return true;
     const searchTerm = teamFilter.toLowerCase().trim();
     return team.team.toLowerCase().includes(searchTerm);
   })
 })).filter(market => market.teams.length > 0); // Only show markets with matching teams

 // Check if current sport supports conference filtering
 const supportsConferenceFilter = ['americanfootball_ncaaf', 'basketball_ncaab'].includes(activeLeague);

 return (
   <main className="min-h-screen bg-blue-50">
     <header className="bg-white shadow-sm">
       <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
         <div className="flex h-16 items-center">
           <h1 className="text-xl font-bold text-blue-600">odds.day</h1>
         </div>
       </div>
     </header>

     <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
       {/* League Navigation */}
       <LeagueNav 
         activeLeague={activeLeague} 
         setActiveLeague={setActiveLeague} 
         onRefresh={forceRefresh}  // Use forceRefresh for manual refresh
         lastUpdated={lastUpdated}
         apiRequestsRemaining={apiRequestsRemaining}
       />

       {/* UPDATED: Team filter and Conference filter - shown for Games view */}
       {effectiveView === 'games' && (
         <div className="mb-6 space-y-4">
           <div className="flex flex-col sm:flex-row gap-4">
             {/* Team filter */}
             <div className="flex-1">
               <div className="relative">
                 <input
                   type="text"
                   placeholder="Filter by team name..."
                   value={teamFilter}
                   onChange={(e) => setTeamFilter(e.target.value)}
                   className="w-full px-4 py-2 pl-10 pr-4 text-gray-700 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                 />
                 <div className="absolute inset-y-0 left-0 flex items-center pl-3">
                   <svg
                     className="w-5 h-5 text-gray-400"
                     fill="none"
                     stroke="currentColor"
                     viewBox="0 0 24 24"
                     xmlns="http://www.w3.org/2000/svg"
                   >
                     <path
                       strokeLinecap="round"
                       strokeLinejoin="round"
                       strokeWidth={2}
                       d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                     />
                   </svg>
                 </div>
                 {teamFilter && (
                   <button
                     onClick={() => setTeamFilter('')}
                     className="absolute inset-y-0 right-0 flex items-center pr-3"
                   >
                     <svg
                       className="w-5 h-5 text-gray-400 hover:text-gray-600"
                       fill="none"
                       stroke="currentColor"
                       viewBox="0 0 24 24"
                       xmlns="http://www.w3.org/2000/svg"
                     >
                       <path
                         strokeLinecap="round"
                         strokeLinejoin="round"
                         strokeWidth={2}
                         d="M6 18L18 6M6 6l12 12"
                       />
                     </svg>
                   </button>
                 )}
               </div>
             </div>

             {/* Conference Filter - NEW */}
             {supportsConferenceFilter && (
               <ConferenceFilter
                 activeLeague={activeLeague}
                 selectedConferences={selectedConferences}
                 onConferencesChange={setSelectedConferences}
               />
             )}
           </div>

           {/* Active filters display */}
           {(teamFilter || selectedConferences.length > 0) && (
             <div className="flex flex-wrap gap-2 items-center">
               {teamFilter && (
                 <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800">
                   Search: &quot;{teamFilter}&quot;
                   <button
                     onClick={() => setTeamFilter('')}
                     className="ml-2 hover:text-blue-600"
                   >
                     ×
                   </button>
                 </span>
               )}
               {selectedConferences.map(conf => (
                 <span key={conf} className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-green-100 text-green-800">
                   {conf}
                   <button
                     onClick={() => setSelectedConferences(selectedConferences.filter(c => c !== conf))}
                     className="ml-2 hover:text-green-600"
                   >
                     ×
                   </button>
                 </span>
               ))}
               <button
                 onClick={() => {
                   setTeamFilter('');
                   setSelectedConferences([]);
                 }}
                 className="text-sm text-gray-600 hover:text-gray-800"
               >
                 Clear all filters
               </button>
             </div>
           )}

           {/* Results count */}
           {(teamFilter || selectedConferences.length > 0) && (
             <p className="text-sm text-gray-600">
               Showing {filteredGames.length} of {games.length} games
             </p>
           )}
         </div>
       )}

       {/* Team filter for Futures view */}
       {effectiveView === 'futures' && (
         <div className="mb-6">
           <div className="relative">
             <input
               type="text"
               placeholder="Filter by team/player name..."
               value={teamFilter}
               onChange={(e) => setTeamFilter(e.target.value)}
               className="w-full px-4 py-2 pl-10 pr-4 text-gray-700 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
             />
             <div className="absolute inset-y-0 left-0 flex items-center pl-3">
               <svg
                 className="w-5 h-5 text-gray-400"
                 fill="none"
                 stroke="currentColor"
                 viewBox="0 0 24 24"
                 xmlns="http://www.w3.org/2000/svg"
               >
                 <path
                   strokeLinecap="round"
                   strokeLinejoin="round"
                   strokeWidth={2}
                   d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                 />
               </svg>
             </div>
             {teamFilter && (
               <button
                 onClick={() => setTeamFilter('')}
                 className="absolute inset-y-0 right-0 flex items-center pr-3"
               >
                 <svg
                   className="w-5 h-5 text-gray-400 hover:text-gray-600"
                   fill="none"
                   stroke="currentColor"
                   viewBox="0 0 24 24"
                   xmlns="http://www.w3.org/2000/svg"
                 >
                   <path
                     strokeLinecap="round"
                     strokeLinejoin="round"
                     strokeWidth={2}
                     d="M6 18L18 6M6 6l12 12"
                   />
                 </svg>
               </button>
             )}
           </div>
           {teamFilter && (
             <p className="mt-2 text-sm text-gray-600">
               Showing {filteredFutures.reduce((acc, m) => acc + m.teams.length, 0)} of {futures.reduce((acc, m) => acc + m.teams.length, 0)} entries
             </p>
           )}
         </div>
       )}

       {/* Toggle between Games and Futures - Custom version for Masters */}
       {activeLeague === MASTERS_LEAGUE_ID ? (
         // Masters only shows Futures tab
         <div className="bg-white rounded-lg shadow p-2 mb-6 flex justify-center">
           <div className="inline-flex rounded-md shadow-sm">
             <button
               type="button"
               className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white border border-gray-200"
             >
               Futures
             </button>
           </div>
         </div>
       ) : (
         // Other leagues show both tabs
         <div className="bg-white rounded-lg shadow p-2 mb-6 flex justify-center">
           <div className="inline-flex rounded-md shadow-sm">
             <button
               type="button"
               className={`px-4 py-2 text-sm font-medium rounded-l-lg ${
                 activeView === 'games'
                   ? 'bg-blue-600 text-white'
                   : 'bg-white text-gray-700 hover:bg-gray-50'
               } border border-gray-200`}
               onClick={() => {
                 setActiveView('games');
                 setTeamFilter(''); // Clear filter when switching views
                 setSelectedConferences([]); // Clear conference filter when switching views
               }}
             >
               Games
             </button>
             <button
               type="button"
               className={`px-4 py-2 text-sm font-medium rounded-r-lg ${
                 activeView === 'futures'
                   ? 'bg-blue-600 text-white'
                   : 'bg-white text-gray-700 hover:bg-gray-50'
               } border border-gray-200 border-l-0`}
               onClick={() => {
                 setActiveView('futures');
                 setTeamFilter(''); // Clear filter when switching views
                 setSelectedConferences([]); // Clear conference filter when switching views
               }}
             >
               Futures
             </button>
           </div>
         </div>
       )}

       {/* Loading state */}
       {loading ? (
         <div className="flex justify-center py-12">
           <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
         </div>
       ) : (
         <div>
           {effectiveView === 'games' ? (
             <div>
               {filteredGames.length === 0 ? (
                 <div className="bg-white rounded-lg shadow p-6 text-center">
                   {teamFilter || selectedConferences.length > 0 
                     ? 'No games match your filters.' 
                     : 'No games available for this league right now.'}
                 </div>
               ) : (
                 <div>
                   {filteredGames.map(game => (
                     <GameCard key={game.id} game={game} />
                   ))}
                 </div>
               )}
             </div>
           ) : (
             <div>
               {filteredFutures.length === 0 ? (
                 <div className="bg-white rounded-lg shadow p-6 text-center">
                   {teamFilter ? `No results found matching &quot;${teamFilter}&quot;.` : 'No futures available for this league right now.'}
                 </div>
               ) : (
                 <div>
                   {/* Banner for Masters on mobile */}
                   {activeLeague === MASTERS_LEAGUE_ID && (
                     <div className="sm:hidden bg-blue-50 p-2 text-center border-b border-blue-100 mb-4">
                       <p className="text-xs text-blue-800 font-medium">
                         ↔️ Rotate phone horizontally to see golfer names
                       </p>
                     </div>
                   )}
                   {filteredFutures.map((market, index) => (
                     <FuturesTable 
                       key={index} 
                       market={market} 
                       compactMode={true}
                       isMasters={activeLeague === MASTERS_LEAGUE_ID && false} // Force false to prevent name changes
                     />
                   ))}
                 </div>
               )}
             </div>
           )}
         </div>
       )}
     </div>
   </main>
 );
}