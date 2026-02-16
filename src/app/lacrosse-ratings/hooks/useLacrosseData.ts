// src/app/lacrosse-ratings/hooks/useLacrosseData.ts

import { useState, useEffect, useCallback } from 'react';
import { DEFAULT_LACROSSE_CONFIG } from '@/lib/lacrosse/constants';
import type { RatingsSnapshot } from '@/lib/lacrosse/types';

export interface UseLacrosseDataReturn {
  loading: boolean;
  error: string | null;
  successMessage: string | null;
  snapshot: RatingsSnapshot | null;
  hca: number;
  isLocalhost: boolean;
  teamLogos: Record<string, string>;
  espnNameMap: Record<string, string>;
  syncRange: { firstGameDate: string | null; lastGameDate: string | null } | null;
  getTeamLogo: (teamName: string) => string | null;
  loadRatings: () => Promise<void>;
  importCsv: (csvText: string) => Promise<void>;
  calculateRatings: (params: { startDate?: string; endDate?: string; maxGames?: number }) => Promise<void>;
  recalculateRatings: () => Promise<void>;
  setError: (error: string | null) => void;
  setSuccessMessage: (message: string | null) => void;
}

export function useLacrosseData(): UseLacrosseDataReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<RatingsSnapshot | null>(null);
  const [hca, setHca] = useState(DEFAULT_LACROSSE_CONFIG.hca);
  const [isLocalhost, setIsLocalhost] = useState(false);
  const [teamLogos, setTeamLogos] = useState<Record<string, string>>({});
  const [espnNameMap, setEspnNameMap] = useState<Record<string, string>>({});
  const [syncRange, setSyncRange] = useState<{ firstGameDate: string | null; lastGameDate: string | null } | null>(null);

  // Check if running locally
  useEffect(() => {
    setIsLocalhost(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  }, []);

  // Load team logos
  const loadTeamLogos = useCallback(async () => {
    try {
      const response = await fetch('/api/lacrosse/team-logos');
      const data = await response.json();
      if (data.success && data.logos) {
        setTeamLogos(data.logos);
        if (data.espnNameMap) {
          setEspnNameMap(data.espnNameMap);
        }
      }
    } catch {
      console.log('Failed to load lacrosse team logos');
    }
  }, []);

  // Get logo URL for a team name
  const getTeamLogo = useCallback((teamName: string): string | null => {
    const normalized = teamName.toLowerCase();

    // Check ESPN override first
    const espnName = espnNameMap[normalized];
    if (espnName && teamLogos[espnName]) {
      return teamLogos[espnName];
    }

    if (teamLogos[normalized]) return teamLogos[normalized];

    // Try without periods
    const noPeriods = normalized.replace(/\./g, '');
    if (teamLogos[noPeriods]) return teamLogos[noPeriods];

    // Try with "State" instead of "St"
    const withState = noPeriods.replace(/\bst\b/g, 'state');
    if (teamLogos[withState]) return teamLogos[withState];

    // Try partial matches
    const words = noPeriods.split(' ');
    if (words.length > 1) {
      for (let i = words.length - 1; i >= 1; i--) {
        const partial = words.slice(0, i).join(' ');
        if (teamLogos[partial]) return teamLogos[partial];

        const partialWithState = partial.replace(/\bst\b/g, 'state');
        if (teamLogos[partialWithState]) return teamLogos[partialWithState];
      }

      const twoWords = words.slice(0, 2).join(' ');
      if (teamLogos[twoWords]) return teamLogos[twoWords];
    }

    return null;
  }, [teamLogos, espnNameMap]);

  // Load ratings
  const loadRatings = useCallback(async () => {
    try {
      const response = await fetch('/api/lacrosse/calculate');
      const data = await response.json();

      if (data.success && data.data) {
        setSnapshot(data.data);
        if (data.config) {
          setHca(data.config.hca);
        }
        if (data.syncRange) {
          setSyncRange(data.syncRange);
        }
      }
    } catch {
      console.log('No cached lacrosse ratings available');
    }
  }, []);

  // Import CSV
  const importCsv = useCallback(async (csvText: string) => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch('/api/lacrosse/import-ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Failed to import ratings');
        return;
      }

      setSuccessMessage(`Imported ${data.teamsImported} teams from Massey CSV`);
      setTimeout(() => setSuccessMessage(null), 10000);

      // Reload ratings
      await loadRatings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [loadRatings]);

  // Sync latest games
  const calculateRatings = useCallback(async (params: {
    startDate?: string;
    endDate?: string;
    maxGames?: number;
  }) => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const requestBody: Record<string, unknown> = {
        hca,
        maxGames: params.maxGames || 200,
      };

      if (params.startDate) requestBody.startDate = params.startDate;
      if (params.endDate) requestBody.endDate = params.endDate;

      const response = await fetch('/api/lacrosse/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Failed to sync ratings');
        return;
      }

      if (data.data) {
        setSnapshot(data.data);
      }
      if (data.syncRange) {
        setSyncRange(data.syncRange);
      }

      const newGames = data.summary?.newGamesProcessed || 0;
      const skipped = data.summary?.gamesSkipped || 0;
      const dateRangeText = params.startDate || params.endDate
        ? ` (${params.startDate || 'start'} to ${params.endDate || 'today'})`
        : '';
      setSuccessMessage(`Sync complete${dateRangeText}! ${newGames} games processed, ${skipped} skipped.`);
      setTimeout(() => setSuccessMessage(null), 10000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [hca]);

  // Recalculate all ratings from initial
  const recalculateRatings = useCallback(async () => {
    if (!confirm('This will reset all team ratings to initial Massey values and replay all game adjustments. Continue?')) {
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch('/api/lacrosse/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'recalculate',
          hca,
          season: 2026,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Failed to recalculate ratings');
        return;
      }

      setSuccessMessage(`Recalculated from ${data.gamesProcessed} games`);
      setTimeout(() => setSuccessMessage(null), 10000);

      // Reload ratings
      await loadRatings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [hca, loadRatings]);

  // Load initial data
  useEffect(() => {
    loadRatings();
    loadTeamLogos();
  }, [loadRatings, loadTeamLogos]);

  return {
    loading,
    error,
    successMessage,
    snapshot,
    hca,
    isLocalhost,
    teamLogos,
    espnNameMap,
    syncRange,
    getTeamLogo,
    loadRatings,
    importCsv,
    calculateRatings,
    recalculateRatings,
    setError,
    setSuccessMessage,
  };
}
