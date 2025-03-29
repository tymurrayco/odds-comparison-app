// src/app/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchOdds, fetchFutures, Game, FuturesMarket } from '@/lib/api';
import LeagueNav from '@/components/LeagueNav';
import GameCard from '@/components/GameCard';
import FuturesTable from '@/components/FuturesTable';

export default function Home() {
 // Initialize with default league
 const [activeLeague, setActiveLeague] = useState('basketball_nba');
 const [activeView, setActiveView] = useState<'games' | 'futures'>('games');
 const [games, setGames] = useState<Game[]>([]);
 const [futures, setFutures] = useState<FuturesMarket[]>([]);
 const [loading, setLoading] = useState(true);
 const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
 const [isClient, setIsClient] = useState(false);

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
 }, [activeLeague]);

 // Save to localStorage when activeLeague changes, but only after hydration
 useEffect(() => {
   if (isClient) {
     localStorage.setItem('activeLeague', activeLeague);
   }
 }, [activeLeague, isClient]);

 const loadData = useCallback(async function() {
   setLoading(true);
   try {
     // Add an artificial delay to make the loading state more visible
     await new Promise(resolve => setTimeout(resolve, 500));
     
     // Determine what data to load
     if (activeLeague === MASTERS_LEAGUE_ID || activeView === 'futures') {
       const data = await fetchFutures(activeLeague);
       setFutures(data);
     } else {
       const data = await fetchOdds(activeLeague);
       setGames(data);
     }
     
     setLastUpdated(new Date());
   } catch (error) {
     console.error('Error loading data:', error);
   } finally {
     setLoading(false);
   }
   
   // Return a resolved promise so we can await this function
   return Promise.resolve();
 }, [activeLeague, activeView]);
 
 // Load data when league or view changes
 useEffect(() => {
   loadData();
 }, [loadData]); // Now we only need loadData in the dependency array

 // Force the effective view for rendering
 const effectiveView = activeLeague === MASTERS_LEAGUE_ID ? 'futures' : activeView;

 return (
   <main className="min-h-screen bg-green-100">
     <header className="bg-white shadow-sm">
       <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
         <div className="flex h-16 items-center">
           <h1 className="text-xl font-bold text-green-600">odds.day</h1>
         </div>
       </div>
     </header>

     <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
       {/* League Navigation */}
       <LeagueNav 
         activeLeague={activeLeague} 
         setActiveLeague={setActiveLeague}
         onRefresh={loadData}
         lastUpdated={lastUpdated}
       />

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
               onClick={() => setActiveView('games')}
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
               onClick={() => setActiveView('futures')}
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
               {games.length === 0 ? (
                 <div className="bg-white rounded-lg shadow p-6 text-center">
                   No games available for this league right now.
                 </div>
               ) : (
                 <div>
                   {games.map(game => (
                     <GameCard key={game.id} game={game} />
                   ))}
                 </div>
               )}
             </div>
           ) : (
             <div>
               {futures.length === 0 ? (
                 <div className="bg-white rounded-lg shadow p-6 text-center">
                   No futures available for this league right now.
                 </div>
               ) : (
                 <div>
                   {futures.map((market, index) => (
                     <FuturesTable key={index} market={market} compactMode={true} />
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