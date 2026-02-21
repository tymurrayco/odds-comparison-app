'use client';

import React from 'react';
import { ALL_TEMPLATES } from '../../utils/bracketTemplates';

interface TemplateSelectorProps {
  selectedTemplateId: string;
  onSelect: (templateId: string) => void;
}

export function TemplateSelector({ selectedTemplateId, onSelect }: TemplateSelectorProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">Bracket Format</label>
      <select
        value={selectedTemplateId}
        onChange={(e) => onSelect(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        {ALL_TEMPLATES.map(t => (
          <option key={t.id} value={t.id}>
            {t.name} ({t.teamCount} teams)
          </option>
        ))}
      </select>
    </div>
  );
}
