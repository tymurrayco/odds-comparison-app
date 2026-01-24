// src/lib/ratings/index.ts

/**
 * Power Ratings Module
 * 
 * Exports all types, constants, and functions for the power ratings system.
 */

// Types
export * from './types';

// Constants
export * from './constants';

// Team name mapping utilities
export {
  TEAM_NAME_MAPPINGS,
  buildOddsApiToKenpomMap,
  buildKenpomToOddsApiMap,
  oddsApiToKenpom,
  kenpomToOddsApi,
  normalizeTeamName,
  fuzzyMatchTeam,
  findTeamByName,
} from './team-mapping';

// Engine functions
export {
  initializeRatings,
  projectSpread,
  getProjection,
  calculateAdjustment,
  applyAdjustment,
  processGame,
  processGames,
  extractClosingSpread,
  createSnapshot,
  formatSpread,
  formatRating,
} from './engine';

// Supabase persistence
export * from './supabase';