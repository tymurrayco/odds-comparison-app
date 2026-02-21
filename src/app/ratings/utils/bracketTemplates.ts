// src/app/ratings/utils/bracketTemplates.ts

import type { BracketTemplate } from '../types/tournament';

// ============================================
// Bracket Templates
// ============================================

const TEMPLATE_4_TEAM: BracketTemplate = {
  id: '4-team',
  name: '4-Team',
  teamCount: 4,
  rounds: [
    {
      round: 1,
      name: 'Semifinals',
      matchups: [
        { id: 'R1-G1', topSeed: 1, bottomSeed: 4, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R1-G2', topSeed: 2, bottomSeed: 3, topFromMatchup: null, bottomFromMatchup: null },
      ],
    },
    {
      round: 2,
      name: 'Championship',
      matchups: [
        { id: 'R2-G1', topSeed: null, bottomSeed: null, topFromMatchup: 'R1-G1', bottomFromMatchup: 'R1-G2' },
      ],
    },
  ],
};

const TEMPLATE_8_TEAM: BracketTemplate = {
  id: '8-team',
  name: '8-Team',
  teamCount: 8,
  rounds: [
    {
      round: 1,
      name: 'Quarterfinals',
      matchups: [
        { id: 'R1-G1', topSeed: 1, bottomSeed: 8, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R1-G2', topSeed: 4, bottomSeed: 5, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R1-G3', topSeed: 3, bottomSeed: 6, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R1-G4', topSeed: 2, bottomSeed: 7, topFromMatchup: null, bottomFromMatchup: null },
      ],
    },
    {
      round: 2,
      name: 'Semifinals',
      matchups: [
        { id: 'R2-G1', topSeed: null, bottomSeed: null, topFromMatchup: 'R1-G1', bottomFromMatchup: 'R1-G2' },
        { id: 'R2-G2', topSeed: null, bottomSeed: null, topFromMatchup: 'R1-G3', bottomFromMatchup: 'R1-G4' },
      ],
    },
    {
      round: 3,
      name: 'Championship',
      matchups: [
        { id: 'R3-G1', topSeed: null, bottomSeed: null, topFromMatchup: 'R2-G1', bottomFromMatchup: 'R2-G2' },
      ],
    },
  ],
};

const TEMPLATE_10_TEAM: BracketTemplate = {
  id: '10-team',
  name: '10-Team (7v10, 8v9 play-in)',
  teamCount: 10,
  rounds: [
    {
      round: 0,
      name: 'Play-In',
      matchups: [
        { id: 'R0-G1', topSeed: 7, bottomSeed: 10, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R0-G2', topSeed: 8, bottomSeed: 9, topFromMatchup: null, bottomFromMatchup: null },
      ],
    },
    {
      round: 1,
      name: 'Quarterfinals',
      matchups: [
        { id: 'R1-G1', topSeed: 1, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R0-G2' },
        { id: 'R1-G2', topSeed: 4, bottomSeed: 5, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R1-G3', topSeed: 3, bottomSeed: 6, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R1-G4', topSeed: 2, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R0-G1' },
      ],
    },
    {
      round: 2,
      name: 'Semifinals',
      matchups: [
        { id: 'R2-G1', topSeed: null, bottomSeed: null, topFromMatchup: 'R1-G1', bottomFromMatchup: 'R1-G2' },
        { id: 'R2-G2', topSeed: null, bottomSeed: null, topFromMatchup: 'R1-G3', bottomFromMatchup: 'R1-G4' },
      ],
    },
    {
      round: 3,
      name: 'Championship',
      matchups: [
        { id: 'R3-G1', topSeed: null, bottomSeed: null, topFromMatchup: 'R2-G1', bottomFromMatchup: 'R2-G2' },
      ],
    },
  ],
};

const TEMPLATE_12_TEAM_TOP4_BYE: BracketTemplate = {
  id: '12-team-top4-bye',
  name: '12-Team (Top 4 Bye)',
  teamCount: 12,
  rounds: [
    {
      round: 1,
      name: 'First Round',
      matchups: [
        { id: 'R1-G1', topSeed: 5, bottomSeed: 12, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R1-G2', topSeed: 8, bottomSeed: 9, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R1-G3', topSeed: 7, bottomSeed: 10, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R1-G4', topSeed: 6, bottomSeed: 11, topFromMatchup: null, bottomFromMatchup: null },
      ],
    },
    {
      round: 2,
      name: 'Quarterfinals',
      matchups: [
        { id: 'R2-G1', topSeed: 1, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R1-G2' },
        { id: 'R2-G2', topSeed: 4, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R1-G1' },
        { id: 'R2-G3', topSeed: 3, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R1-G4' },
        { id: 'R2-G4', topSeed: 2, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R1-G3' },
      ],
    },
    {
      round: 3,
      name: 'Semifinals',
      matchups: [
        { id: 'R3-G1', topSeed: null, bottomSeed: null, topFromMatchup: 'R2-G1', bottomFromMatchup: 'R2-G2' },
        { id: 'R3-G2', topSeed: null, bottomSeed: null, topFromMatchup: 'R2-G3', bottomFromMatchup: 'R2-G4' },
      ],
    },
    {
      round: 4,
      name: 'Championship',
      matchups: [
        { id: 'R4-G1', topSeed: null, bottomSeed: null, topFromMatchup: 'R3-G1', bottomFromMatchup: 'R3-G2' },
      ],
    },
  ],
};

const TEMPLATE_14_TEAM_TOP2_DBL: BracketTemplate = {
  id: '14-team-top2-dbl',
  name: '14-Team (Top 2 Double Bye)',
  teamCount: 14,
  rounds: [
    {
      round: 0,
      name: 'Play-In',
      matchups: [
        { id: 'R0-G1', topSeed: 7, bottomSeed: 10, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R0-G2', topSeed: 8, bottomSeed: 9, topFromMatchup: null, bottomFromMatchup: null },
      ],
    },
    {
      round: 1,
      name: 'First Round',
      matchups: [
        { id: 'R1-G1', topSeed: 3, bottomSeed: 14, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R1-G2', topSeed: 6, bottomSeed: 11, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R1-G3', topSeed: 5, bottomSeed: 12, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R1-G4', topSeed: 4, bottomSeed: 13, topFromMatchup: null, bottomFromMatchup: null },
      ],
    },
    {
      round: 2,
      name: 'Quarterfinals',
      matchups: [
        { id: 'R2-G1', topSeed: null, bottomSeed: null, topFromMatchup: 'R1-G1', bottomFromMatchup: 'R0-G1' },
        { id: 'R2-G2', topSeed: null, bottomSeed: null, topFromMatchup: 'R1-G2', bottomFromMatchup: 'R1-G3' },
        { id: 'R2-G3', topSeed: null, bottomSeed: null, topFromMatchup: 'R0-G2', bottomFromMatchup: 'R1-G4' },
      ],
    },
    {
      round: 3,
      name: 'Semifinals',
      matchups: [
        { id: 'R3-G1', topSeed: 1, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R2-G1' },
        { id: 'R3-G2', topSeed: 2, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R2-G3' },
      ],
    },
    {
      round: 4,
      name: 'Championship',
      matchups: [
        { id: 'R4-G1', topSeed: null, bottomSeed: null, topFromMatchup: 'R3-G1', bottomFromMatchup: 'R3-G2' },
      ],
    },
  ],
};

const TEMPLATE_16_TEAM: BracketTemplate = {
  id: '16-team',
  name: '16-Team',
  teamCount: 16,
  rounds: [
    {
      round: 1,
      name: 'First Round',
      matchups: [
        { id: 'R1-G1', topSeed: 1, bottomSeed: 16, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R1-G2', topSeed: 8, bottomSeed: 9, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R1-G3', topSeed: 5, bottomSeed: 12, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R1-G4', topSeed: 4, bottomSeed: 13, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R1-G5', topSeed: 3, bottomSeed: 14, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R1-G6', topSeed: 6, bottomSeed: 11, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R1-G7', topSeed: 7, bottomSeed: 10, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R1-G8', topSeed: 2, bottomSeed: 15, topFromMatchup: null, bottomFromMatchup: null },
      ],
    },
    {
      round: 2,
      name: 'Quarterfinals',
      matchups: [
        { id: 'R2-G1', topSeed: null, bottomSeed: null, topFromMatchup: 'R1-G1', bottomFromMatchup: 'R1-G2' },
        { id: 'R2-G2', topSeed: null, bottomSeed: null, topFromMatchup: 'R1-G3', bottomFromMatchup: 'R1-G4' },
        { id: 'R2-G3', topSeed: null, bottomSeed: null, topFromMatchup: 'R1-G5', bottomFromMatchup: 'R1-G6' },
        { id: 'R2-G4', topSeed: null, bottomSeed: null, topFromMatchup: 'R1-G7', bottomFromMatchup: 'R1-G8' },
      ],
    },
    {
      round: 3,
      name: 'Semifinals',
      matchups: [
        { id: 'R3-G1', topSeed: null, bottomSeed: null, topFromMatchup: 'R2-G1', bottomFromMatchup: 'R2-G2' },
        { id: 'R3-G2', topSeed: null, bottomSeed: null, topFromMatchup: 'R2-G3', bottomFromMatchup: 'R2-G4' },
      ],
    },
    {
      round: 4,
      name: 'Championship',
      matchups: [
        { id: 'R4-G1', topSeed: null, bottomSeed: null, topFromMatchup: 'R3-G1', bottomFromMatchup: 'R3-G2' },
      ],
    },
  ],
};

// ============================================
// Template Registry
// ============================================

export const BRACKET_TEMPLATES: Record<string, BracketTemplate> = {
  '4-team': TEMPLATE_4_TEAM,
  '8-team': TEMPLATE_8_TEAM,
  '10-team': TEMPLATE_10_TEAM,
  '12-team-top4-bye': TEMPLATE_12_TEAM_TOP4_BYE,
  '14-team-top2-dbl': TEMPLATE_14_TEAM_TOP2_DBL,
  '16-team': TEMPLATE_16_TEAM,
};

export const ALL_TEMPLATES = Object.values(BRACKET_TEMPLATES);

// ============================================
// Conference Defaults
// ============================================

export const CONFERENCE_DEFAULTS: Record<string, { templateId: string; name: string }> = {
  // Power conferences (16 teams)
  'B12': { templateId: '16-team', name: 'Big 12 Tournament' },
  'SEC': { templateId: '16-team', name: 'SEC Tournament' },
  'ACC': { templateId: '16-team', name: 'ACC Tournament' },
  'B10': { templateId: '16-team', name: 'Big Ten Tournament' },
  // 14-team
  'MWC': { templateId: '14-team-top2-dbl', name: 'Mountain West Tournament' },
  'CUSA': { templateId: '14-team-top2-dbl', name: 'Conference USA Tournament' },
  // 12-team top 4 bye
  'BE': { templateId: '12-team-top4-bye', name: 'Big East Tournament' },
  'A10': { templateId: '12-team-top4-bye', name: 'Atlantic 10 Tournament' },
  'MAC': { templateId: '12-team-top4-bye', name: 'MAC Tournament' },
  'SB': { templateId: '12-team-top4-bye', name: 'Sun Belt Tournament' },
  'SC': { templateId: '12-team-top4-bye', name: 'SoCon Tournament' },
  'CAA': { templateId: '12-team-top4-bye', name: 'CAA Tournament' },
  'BSky': { templateId: '12-team-top4-bye', name: 'Big Sky Tournament' },
  'OVC': { templateId: '12-team-top4-bye', name: 'OVC Tournament' },
  'Horz': { templateId: '12-team-top4-bye', name: 'Horizon League Tournament' },
  // 10-team
  'WCC': { templateId: '10-team', name: 'WCC Tournament' },
  'MVC': { templateId: '10-team', name: 'MVC Tournament' },
  'WAC': { templateId: '10-team', name: 'WAC Tournament' },
  'AE': { templateId: '10-team', name: 'America East Tournament' },
  'BW': { templateId: '10-team', name: 'Big West Tournament' },
  'ASun': { templateId: '10-team', name: 'ASUN Tournament' },
  'Sum': { templateId: '10-team', name: 'Summit League Tournament' },
  // 8-team
  'Pat': { templateId: '8-team', name: 'Patriot League Tournament' },
  'NEC': { templateId: '8-team', name: 'NEC Tournament' },
  'MAAC': { templateId: '8-team', name: 'MAAC Tournament' },
  'MEAC': { templateId: '8-team', name: 'MEAC Tournament' },
  'SWAC': { templateId: '8-team', name: 'SWAC Tournament' },
  'Slnd': { templateId: '8-team', name: 'Southland Tournament' },
  // 4-team
  'Ivy': { templateId: '4-team', name: 'Ivy League Tournament' },
};

export function getDefaultTemplate(conference: string): BracketTemplate {
  const conf = CONFERENCE_DEFAULTS[conference];
  if (conf) {
    return BRACKET_TEMPLATES[conf.templateId];
  }
  // Fallback: guess by team count range (use 8-team as default)
  return BRACKET_TEMPLATES['8-team'];
}

export function getDefaultBracketName(conference: string): string {
  return CONFERENCE_DEFAULTS[conference]?.name || `${conference} Tournament`;
}
