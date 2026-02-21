'use client';

import React from 'react';

interface ConferenceSelectorProps {
  conferences: string[];
  selectedConference: string | null;
  onSelect: (conference: string) => void;
  teamCountByConference: Record<string, number>;
}

export function ConferenceSelector({
  conferences,
  selectedConference,
  onSelect,
  teamCountByConference,
}: ConferenceSelectorProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">Conference</label>
      <select
        value={selectedConference || ''}
        onChange={(e) => onSelect(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        <option value="">Select conference...</option>
        {conferences.map(conf => (
          <option key={conf} value={conf}>
            {conf} ({teamCountByConference[conf] || 0} teams)
          </option>
        ))}
      </select>
    </div>
  );
}
