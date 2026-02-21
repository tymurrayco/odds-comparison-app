'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { RatingsSnapshot } from '@/lib/ratings/types';
import type { BracketTeam, BracketMatchup, BracketConfig } from '../types/tournament';
import {
  BRACKET_TEMPLATES,
  getDefaultTemplate,
  getDefaultBracketName,
} from '../utils/bracketTemplates';
import {
  buildMatchups,
  projectBracket,
  toggleMatchupWinner,
  resetProjections,
} from '../utils/tournamentProjection';
import { ConferenceSelector } from './tournament/ConferenceSelector';
import { TemplateSelector } from './tournament/TemplateSelector';
import { SeedingPanel } from './tournament/SeedingPanel';
import { BracketVisualization } from './tournament/BracketVisualization';
import { SavedBracketsPanel } from './tournament/SavedBracketsPanel';

interface TournamentsTabProps {
  snapshot: RatingsSnapshot | null;
  hca: number;
  getTeamLogo: (teamName: string) => string | null;
}

interface SavedBracketRow {
  id: string;
  name: string;
  conference: string;
  configJson: BracketConfig;
  season: number;
  createdAt: string;
  updatedAt: string;
}

export function TournamentsTab({ snapshot, hca, getTeamLogo }: TournamentsTabProps) {
  // State
  const [selectedConference, setSelectedConference] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string>('8-team');
  const [teams, setTeams] = useState<BracketTeam[]>([]);
  const [matchups, setMatchups] = useState<BracketMatchup[]>([]);
  const [savedBrackets, setSavedBrackets] = useState<SavedBracketRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingBrackets, setLoadingBrackets] = useState(true);

  // Derived data
  const conferences = useMemo(() => {
    if (!snapshot) return [];
    const confSet = new Set<string>();
    for (const r of snapshot.ratings) {
      if (r.conference) confSet.add(r.conference);
    }
    return [...confSet].sort();
  }, [snapshot]);

  const teamCountByConference = useMemo(() => {
    if (!snapshot) return {};
    const counts: Record<string, number> = {};
    for (const r of snapshot.ratings) {
      if (r.conference) {
        counts[r.conference] = (counts[r.conference] || 0) + 1;
      }
    }
    return counts;
  }, [snapshot]);

  // Load saved brackets on mount
  useEffect(() => {
    loadSavedBrackets();
  }, []);

  async function loadSavedBrackets() {
    setLoadingBrackets(true);
    try {
      const res = await fetch('/api/ratings/tournaments?season=2026');
      const data = await res.json();
      if (data.success) {
        setSavedBrackets(data.brackets);
      }
    } catch (err) {
      console.error('[Tournaments] Failed to load brackets:', err);
    } finally {
      setLoadingBrackets(false);
    }
  }

  // When conference changes, populate teams and pick default template
  function handleConferenceSelect(conference: string) {
    if (!snapshot) return;
    setSelectedConference(conference);

    // Check if we have a saved bracket for this conference
    const saved = savedBrackets.find(b => b.conference === conference);
    if (saved && saved.configJson) {
      const config = saved.configJson;
      setTemplateId(config.templateId);
      setTeams(config.teams);
      // Re-project to restore matchups (in case ratings changed)
      const template = BRACKET_TEMPLATES[config.templateId];
      if (template) {
        // Restore matchups with manual overrides preserved
        setMatchups(config.matchups);
        return;
      }
    }

    // Fresh setup: get teams sorted by rating for this conference
    const confTeams = snapshot.ratings
      .filter(r => r.conference === conference)
      .sort((a, b) => b.rating - a.rating)
      .map((r, idx) => ({
        teamName: r.teamName,
        seed: idx + 1,
        rating: r.rating,
        conference: r.conference || conference,
        logoUrl: getTeamLogo(r.teamName),
      }));

    setTeams(confTeams);

    // Pick default template
    const defaultTemplate = getDefaultTemplate(conference);
    setTemplateId(defaultTemplate.id);

    // Build and project bracket
    const template = defaultTemplate;
    const newMatchups = buildMatchups(template, confTeams);
    const projected = projectBracket(newMatchups, hca);
    setMatchups(projected);
  }

  // When template changes, rebuild bracket with current teams
  function handleTemplateChange(newTemplateId: string) {
    setTemplateId(newTemplateId);
    const template = BRACKET_TEMPLATES[newTemplateId];
    if (!template) return;

    const newMatchups = buildMatchups(template, teams);
    const projected = projectBracket(newMatchups, hca);
    setMatchups(projected);
  }

  // When seeds change, rebuild bracket
  function handleSeedChange(newTeams: BracketTeam[]) {
    setTeams(newTeams);
    const template = BRACKET_TEMPLATES[templateId];
    if (!template) return;

    const newMatchups = buildMatchups(template, newTeams);
    const projected = projectBracket(newMatchups, hca);
    setMatchups(projected);
  }

  // Toggle winner on a matchup
  function handlePickWinner(matchupId: string, side: 'top' | 'bottom') {
    const updated = toggleMatchupWinner(matchups, matchupId, side, hca);
    setMatchups(updated);
  }

  // Reset all overrides
  function handleReset() {
    const reset = resetProjections(matchups, hca);
    setMatchups(reset);
  }

  // Auto-save bracket
  const saveBracket = useCallback(async () => {
    if (!selectedConference || matchups.length === 0) return;
    setSaving(true);
    try {
      const config: BracketConfig = {
        id: `${selectedConference}-2026`,
        name: getDefaultBracketName(selectedConference),
        conference: selectedConference,
        templateId,
        teams,
        matchups,
        updatedAt: new Date().toISOString(),
      };

      const res = await fetch('/api/ratings/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conference: selectedConference,
          name: config.name,
          configJson: config,
          season: 2026,
        }),
      });

      const data = await res.json();
      if (data.success) {
        // Update saved brackets list
        setSavedBrackets(prev => {
          const idx = prev.findIndex(b => b.conference === selectedConference);
          const newRow: SavedBracketRow = {
            id: data.bracket.id,
            name: data.bracket.name,
            conference: data.bracket.conference,
            configJson: config,
            season: 2026,
            createdAt: data.bracket.createdAt,
            updatedAt: data.bracket.updatedAt,
          };
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = newRow;
            return updated;
          }
          return [newRow, ...prev];
        });
      }
    } catch (err) {
      console.error('[Tournaments] Failed to save bracket:', err);
    } finally {
      setSaving(false);
    }
  }, [selectedConference, matchups, teams, templateId]);

  // Auto-save when matchups change (debounced)
  useEffect(() => {
    if (!selectedConference || matchups.length === 0) return;
    const timer = setTimeout(() => {
      saveBracket();
    }, 1000);
    return () => clearTimeout(timer);
  }, [matchups, saveBracket, selectedConference]);

  // Delete bracket
  async function handleDeleteBracket(id: string) {
    try {
      const res = await fetch(`/api/ratings/tournaments?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setSavedBrackets(prev => prev.filter(b => b.id !== id));
        // If we deleted the active bracket, clear state
        const deleted = savedBrackets.find(b => b.id === id);
        if (deleted && deleted.conference === selectedConference) {
          setSelectedConference(null);
          setMatchups([]);
          setTeams([]);
        }
      }
    } catch (err) {
      console.error('[Tournaments] Failed to delete bracket:', err);
    }
  }

  // Load a saved bracket by conference
  function handleLoadBracket(conference: string) {
    handleConferenceSelect(conference);
  }

  const template = BRACKET_TEMPLATES[templateId];
  const hasOverrides = matchups.some(m => m.isManualOverride);

  if (!snapshot) {
    return (
      <div className="p-6 text-center text-gray-500">
        Loading ratings data...
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex gap-6">
        {/* Left sidebar: controls */}
        <div className="w-64 flex-shrink-0 space-y-4">
          <ConferenceSelector
            conferences={conferences}
            selectedConference={selectedConference}
            onSelect={handleConferenceSelect}
            teamCountByConference={teamCountByConference}
          />

          {selectedConference && (
            <>
              <TemplateSelector
                selectedTemplateId={templateId}
                onSelect={handleTemplateChange}
              />

              <SeedingPanel
                teams={teams}
                maxSeeds={template?.teamCount || 8}
                onReorder={handleSeedChange}
                getTeamLogo={getTeamLogo}
              />

              <div className="flex gap-2">
                {hasOverrides && (
                  <button
                    onClick={handleReset}
                    className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
                  >
                    Reset Projections
                  </button>
                )}
                {saving && (
                  <span className="text-xs text-gray-400 self-center">Saving...</span>
                )}
              </div>
            </>
          )}

          <div className="border-t border-gray-200 pt-4">
            <SavedBracketsPanel
              brackets={savedBrackets.map(b => ({
                id: b.id,
                name: b.name,
                conference: b.conference,
                updatedAt: b.updatedAt,
              }))}
              onLoad={handleLoadBracket}
              onDelete={handleDeleteBracket}
              activeConference={selectedConference}
            />
          </div>
        </div>

        {/* Main area: bracket visualization */}
        <div className="flex-1 min-w-0">
          {selectedConference && template && matchups.length > 0 ? (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  {getDefaultBracketName(selectedConference)}
                </h2>
                {hasOverrides && (
                  <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">
                    Manual picks active
                  </span>
                )}
              </div>
              <BracketVisualization
                template={template}
                matchups={matchups}
                onPickWinner={handlePickWinner}
                getTeamLogo={getTeamLogo}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
              {loadingBrackets ? (
                'Loading saved brackets...'
              ) : (
                'Select a conference to generate a tournament bracket'
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
