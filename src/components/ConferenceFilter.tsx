// src/components/ConferenceFilter.tsx
import { useState } from 'react';
import { getConferencesForSport } from '@/lib/conferences';

interface ConferenceFilterProps {
  activeLeague: string;
  selectedConferences: string[];
  onConferencesChange: (conferences: string[]) => void;
}

export default function ConferenceFilter({ 
  activeLeague, 
  selectedConferences, 
  onConferencesChange 
}: ConferenceFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Get conferences for the current sport
  const conferences = getConferencesForSport(activeLeague);
  
  // Don't show filter if no conferences available
  if (conferences.length === 0) return null;
  
  // Filter conferences based on search
  const filteredConferences = conferences.filter(conf =>
    conf.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const handleToggleConference = (conference: string) => {
    if (selectedConferences.includes(conference)) {
      onConferencesChange(selectedConferences.filter(c => c !== conference));
    } else {
      onConferencesChange([...selectedConferences, conference]);
    }
  };
  
  const handleSelectAll = () => {
    onConferencesChange(conferences);
  };
  
  const handleClearAll = () => {
    onConferencesChange([]);
  };
  
  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <div className="flex items-center space-x-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <span>
            {selectedConferences.length === 0 
              ? 'All Conferences' 
              : selectedConferences.length === conferences.length
              ? 'All Conferences'
              : `${selectedConferences.length} Conference${selectedConferences.length !== 1 ? 's' : ''}`
            }
          </span>
          <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-lg border border-gray-200 z-20">
            <div className="p-3 border-b border-gray-200">
              <input
                type="text"
                placeholder="Search conferences..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div className="p-2 border-b border-gray-200">
              <div className="flex justify-between">
                <button
                  onClick={handleSelectAll}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Select All
                </button>
                <button
                  onClick={handleClearAll}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Clear All
                </button>
              </div>
            </div>
            
            <div className="max-h-64 overflow-y-auto">
              {filteredConferences.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  No conferences found
                </div>
              ) : (
                filteredConferences.map(conference => (
                  <label
                    key={conference}
                    className="flex items-center px-4 py-2 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedConferences.includes(conference)}
                      onChange={() => handleToggleConference(conference)}
                      className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="text-sm text-gray-700">{conference}</span>
                  </label>
                ))
              )}
            </div>
            
            {selectedConferences.length > 0 && selectedConferences.length < conferences.length && (
              <div className="p-2 border-t border-gray-200 bg-gray-50">
                <div className="text-xs text-gray-600">
                  Selected: {selectedConferences.join(', ')}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}