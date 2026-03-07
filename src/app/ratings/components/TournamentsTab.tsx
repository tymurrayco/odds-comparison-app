'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  calculateTournamentWinProbs,
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

/** Render simple markdown: **bold**, *italic*, newlines */
function renderSimpleMarkdown(text: string): React.ReactNode[] {
  return text.split('\n').map((line, li) => {
    // Process inline formatting
    const parts: React.ReactNode[] = [];
    let remaining = line;
    let key = 0;

    while (remaining.length > 0) {
      // Bold: **text**
      const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*(.*)/);
      if (boldMatch) {
        if (boldMatch[1]) parts.push(<span key={key++}>{boldMatch[1]}</span>);
        parts.push(<strong key={key++}>{boldMatch[2]}</strong>);
        remaining = boldMatch[3];
        continue;
      }
      // Italic: *text*
      const italicMatch = remaining.match(/^(.*?)\*(.+?)\*(.*)/);
      if (italicMatch) {
        if (italicMatch[1]) parts.push(<span key={key++}>{italicMatch[1]}</span>);
        parts.push(<em key={key++}>{italicMatch[2]}</em>);
        remaining = italicMatch[3];
        continue;
      }
      // No more matches
      parts.push(<span key={key++}>{remaining}</span>);
      break;
    }

    return (
      <React.Fragment key={li}>
        {li > 0 && <br />}
        {parts}
      </React.Fragment>
    );
  });
}

function BracketNotes({ notes, onChange }: { notes: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Auto-size textarea to fit content
  const autoResize = React.useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, []);

  React.useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
      autoResize();
    }
  }, [editing, autoResize]);

  if (editing) {
    return (
      <div className="mt-2 max-w-xl">
        <textarea
          ref={textareaRef}
          value={notes}
          onChange={(e) => { onChange(e.target.value); autoResize(); }}
          onBlur={() => setEditing(false)}
          placeholder="Add notes... (**bold**, *italic*)"
          rows={1}
          className="w-full text-sm text-gray-900 bg-white border border-gray-900 rounded-lg px-3 py-1.5 resize-y focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 placeholder:text-gray-400"
        />
      </div>
    );
  }

  if (!notes) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="mt-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
      >
        + Add notes
      </button>
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className="mt-2 max-w-xl text-sm text-gray-900 bg-white border border-gray-900 rounded-lg px-3 py-1.5 cursor-text hover:bg-gray-50 transition-colors"
    >
      {renderSimpleMarkdown(notes)}
    </div>
  );
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
  const [notes, setNotes] = useState<string>('');
  const pendingSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveBracketRef = useRef<(() => Promise<void>) | undefined>(undefined);

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

    // Flush any pending save for the current conference before switching
    if (pendingSaveRef.current) {
      clearTimeout(pendingSaveRef.current);
      pendingSaveRef.current = null;
      if (selectedConference && matchups.length > 0) {
        saveBracketRef.current?.();
      }
    }

    setSelectedConference(conference);

    // Check if we have a saved bracket for this conference
    const saved = savedBrackets.find(b => b.conference === conference);
    if (saved && saved.configJson) {
      const config = saved.configJson;
      setTemplateId(config.templateId);
      setTeams(config.teams);
      setNotes(config.notes || '');
      // Re-project to restore matchups (in case ratings changed)
      const template = BRACKET_TEMPLATES[config.templateId];
      if (template) {
        // Restore matchups with manual overrides preserved
        setMatchups(config.matchups);
        return;
      }
    } else {
      setNotes('');
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

    // Build and project bracket (all fresh teams are eligible)
    rebuildBracket(defaultTemplate.id, confTeams);
  }

  // When template changes, rebuild bracket with current teams
  function handleTemplateChange(newTemplateId: string) {
    setTemplateId(newTemplateId);
    rebuildBracket(newTemplateId, teams);
  }

  // When seeds change, rebuild bracket
  function handleSeedChange(newTeams: BracketTeam[]) {
    setTeams(newTeams);
    rebuildBracket(templateId, newTeams);
  }

  // Toggle a team's ineligibility and rebuild bracket
  function handleToggleIneligible(teamName: string) {
    const newTeams = teams.map(t =>
      t.teamName === teamName ? { ...t, ineligible: !t.ineligible } : t
    );
    // Re-seed eligible teams
    let seed = 1;
    const reseeded = newTeams.map(t => {
      if (t.ineligible) return { ...t, seed: 0 };
      return { ...t, seed: seed++ };
    });
    setTeams(reseeded);
    rebuildBracket(templateId, reseeded);
  }

  // Helper: rebuild bracket from template + teams (filters to eligible only)
  function rebuildBracket(tplId: string, allTeams: BracketTeam[]) {
    const template = BRACKET_TEMPLATES[tplId];
    if (!template) return;
    const eligible = allTeams.filter(t => !t.ineligible);
    const newMatchups = buildMatchups(template, eligible);
    const projected = projectBracket(newMatchups, hca);
    setMatchups(projected);
  }

  // Toggle winner on a matchup
  function handlePickWinner(matchupId: string, side: 'top' | 'bottom') {
    const updated = toggleMatchupWinner(matchups, matchupId, side, hca);
    setMatchups(updated);
  }

  // Toggle completed status on a matchup
  function handleToggleCompleted(matchupId: string) {
    setMatchups(prev => prev.map(m =>
      m.id === matchupId ? { ...m, isCompleted: !m.isCompleted } : m
    ));
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
        notes,
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
  }, [selectedConference, matchups, teams, templateId, notes]);

  // Keep ref in sync so we can flush the latest save on conference switch
  saveBracketRef.current = saveBracket;

  // Auto-save when matchups or notes change (debounced)
  useEffect(() => {
    if (!selectedConference || matchups.length === 0) return;
    const timer = setTimeout(() => {
      saveBracket();
    }, 1000);
    pendingSaveRef.current = timer;
    return () => { clearTimeout(timer); pendingSaveRef.current = null; };
  }, [matchups, notes, saveBracket, selectedConference]);

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
          setNotes('');
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

  // Calculate tournament win probabilities (reacts to matchup changes / completed games)
  const tournamentWinProbs = useMemo(() => {
    if (!template || teams.length === 0) return new Map<string, number>();
    const eligible = teams.filter(t => !t.ineligible);
    return calculateTournamentWinProbs(template, eligible, hca, matchups);
  }, [template, teams, hca, matchups]);

  // Compute eliminated teams (lost a completed game)
  const eliminatedTeams = useMemo(() => {
    const eliminated = new Set<string>();
    for (const m of matchups) {
      if (!m.isCompleted || !m.winner) continue;
      const loser = m.winner === 'top' ? m.bottomTeam : m.topTeam;
      if (loser) eliminated.add(loser.teamName);
    }
    return eliminated;
  }, [matchups]);

  if (!snapshot) {
    return (
      <div className="p-6 text-center text-gray-500">
        Loading ratings data...
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6">
      <div className="flex flex-col md:flex-row gap-4 md:gap-6">
        {/* Left sidebar: controls */}
        <div className="w-full md:w-64 md:flex-shrink-0 space-y-4">
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
                onToggleIneligible={handleToggleIneligible}
                getTeamLogo={getTeamLogo}
                tournamentWinProbs={tournamentWinProbs}
                eliminatedTeams={eliminatedTeams}
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
              <div className="mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {getDefaultBracketName(selectedConference)}
                  </h2>
                  {hasOverrides && (
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">
                      Manual picks active
                    </span>
                  )}
                </div>
                <BracketNotes notes={notes} onChange={setNotes} />
              </div>
              <BracketVisualization
                template={template}
                matchups={matchups}
                onPickWinner={handlePickWinner}
                onToggleCompleted={handleToggleCompleted}
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
