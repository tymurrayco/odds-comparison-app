// src/lib/lacrosse/index.ts

// Types
export * from './types';

// Constants
export * from './constants';

// Engine functions (reuse from NCAAB - already generic)
export {
  projectSpread,
  calculateAdjustment,
  applyAdjustment,
  createSnapshot,
  formatSpread,
  formatRating,
} from '@/lib/ratings/engine';

// Supabase persistence (lacrosse-specific)
export * from './supabase';
