// src/components/BookmakerSelector.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { BOOKMAKERS } from '@/lib/api';

interface BookmakerSelectorProps {
  selectedBookmakers: string[];
  onSelectionChange: (bookmakers: string[]) => void;
}

// Bookmaker logos mapping
const bookmakerLogos: { [key: string]: string } = {
  'DraftKings': '/bookmaker-logos/draftkings.png',
  'FanDuel': '/bookmaker-logos/fd.png',
  'BetMGM': '/bookmaker-logos/betmgm.png',
  'BetRivers': '/bookmaker-logos/betrivers.png'
};

export default function BookmakerSelector({ 
  selectedBookmakers, 
  onSelectionChange 
}: BookmakerSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const toggleBookmaker = (bookmaker: string) => {
    if (selectedBookmakers.includes(bookmaker)) {
      // Don't allow deselecting if it's the last one
      if (selectedBookmakers.length > 1) {
        onSelectionChange(selectedBookmakers.filter(b => b !== bookmaker));
      }
    } else {
      onSelectionChange([...selectedBookmakers, bookmaker]);
    }
  };

  const selectAll = () => {
    onSelectionChange([...BOOKMAKERS]);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button - iOS Style */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium text-gray-700 transition-all border border-gray-200 shadow-sm"
      >
        <div className="flex -space-x-1">
          {selectedBookmakers.slice(0, 4).map(book => (
            <img 
              key={book}
              src={bookmakerLogos[book]} 
              alt={book} 
              className="h-5 w-5 rounded-full bg-white border border-gray-200"
              style={{ objectFit: 'contain' }}
            />
          ))}
        </div>
        <svg 
          className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown - iOS Style */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden z-50">
          {/* Header */}
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">Sportsbooks</span>
              <button
                onClick={selectAll}
                className="text-xs text-blue-600 font-medium hover:text-blue-700"
              >
                Select All
              </button>
            </div>
          </div>

          {/* Bookmaker List */}
          <div className="py-1">
            {BOOKMAKERS.map((bookmaker, index) => {
              const isSelected = selectedBookmakers.includes(bookmaker);
              const isLast = index === BOOKMAKERS.length - 1;
              
              return (
                <button
                  key={bookmaker}
                  onClick={() => toggleBookmaker(bookmaker)}
                  className={`w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors ${
                    !isLast ? 'border-b border-gray-100' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <img 
                      src={bookmakerLogos[bookmaker]} 
                      alt={bookmaker} 
                      className="h-6 w-6"
                    />
                    <span className="text-sm font-medium text-gray-900">{bookmaker}</span>
                  </div>
                  
                  {/* iOS-style checkmark */}
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                    isSelected 
                      ? 'bg-blue-500' 
                      : 'border-2 border-gray-300'
                  }`}>
                    {isSelected && (
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Footer hint */}
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-200">
            <p className="text-xs text-gray-500 text-center">
              Select at least one book
            </p>
          </div>
        </div>
      )}
    </div>
  );
}