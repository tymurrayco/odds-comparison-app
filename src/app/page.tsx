// src/app/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { LEAGUES, fetchOdds, fetchFutures, Game, FuturesMarket } from '@/lib/api';
import LeagueNav from '@/components/LeagueNav';
import GameCard from '@/components/GameCard';
import FuturesTable from '@/components/FuturesTable';

export default function Home() {
 const [activeLeague, setActiveLeague] = useState('basketball_nba');
 const [activeView, setActiveView] = useState<'games' | 'futures'>('games');
 const [games, setGames] = useState<Game[]>([]);
 const [futures, setFutures] = useState<FuturesMarket[]>([]);
 const [loading, setLoading] = useState(true);
 const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

 async function loadData() {
   setLoading(true);
   try {
     // Add an artificial delay to make the loading state more visible
     await new Promise(resolve => setTimeout(resolve, 500));
     
     if (activeView === 'games') {
       const data = await fetchOdds(activeLeague);
       setGames(data);
     } else {
       const data = await fetchFutures(activeLeague);
       setFutures(data);
     }
     setLastUpdated(new Date());
   } catch (error) {
     console.error('Error loading data:', error);
   } finally {
     setLoading(false);
   }
   
   // Return a resolved promise so we can await this function
   return Promise.resolve();
 }
 
 // Load data when league or view changes
 useEffect(() => {
   loadData();
 }, [activeLeague, activeView]);

 return (
   <main className="min-h-screen bg-gray-50">
     <header className="bg-white shadow-sm">
       <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
         <div className="flex h-16 items-center">
           <h1 className="text-xl font-bold text-blue-600">OddsCompare</h1>
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

       {/* Toggle between Games and Futures */}
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

       {/* Loading state */}
       {loading ? (
         <div className="flex justify-center py-12">
           <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
         </div>
       ) : (
         <div>
           {activeView === 'games' ? (
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
                     <FuturesTable key={index} market={market} leagueId={activeLeague} />
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