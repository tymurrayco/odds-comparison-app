'use client';

import React from 'react';

interface SavedBracket {
  id: string;
  name: string;
  conference: string;
  updatedAt: string;
}

interface SavedBracketsPanelProps {
  brackets: SavedBracket[];
  onLoad: (conference: string) => void;
  onDelete: (id: string) => void;
  activeConference: string | null;
}

export function SavedBracketsPanel({ brackets, onLoad, onDelete, activeConference }: SavedBracketsPanelProps) {
  if (brackets.length === 0) {
    return (
      <div className="text-sm text-gray-400 italic py-2">
        No saved brackets yet
      </div>
    );
  }

  return (
    <div>
      <div className="text-xs font-medium text-gray-500 mb-2">Saved Brackets</div>
      <div className="space-y-1">
        {brackets.map(bracket => (
          <div
            key={bracket.id}
            className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
              activeConference === bracket.conference
                ? 'bg-blue-50 border border-blue-200'
                : 'bg-gray-50 border border-gray-100 hover:bg-gray-100'
            }`}
          >
            <button
              onClick={() => onLoad(bracket.conference)}
              className="flex-1 text-left"
            >
              <div className="font-medium text-gray-900">{bracket.name}</div>
              <div className="text-xs text-gray-400">
                {new Date(bracket.updatedAt).toLocaleDateString()}
              </div>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(bracket.id); }}
              className="text-gray-300 hover:text-red-500 ml-2 text-xs p-1"
              title="Delete bracket"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
