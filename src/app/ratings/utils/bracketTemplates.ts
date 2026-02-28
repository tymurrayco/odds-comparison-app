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

// 7-team: Play-in 6v7, QF, Semis (1-2 bye), Championship
// Used by: WAC, MEAC
const TEMPLATE_7_TEAM: BracketTemplate = {
  id: '7-team',
  name: '7-Team (Top 2 Bye to Semis)',
  teamCount: 7,
  rounds: [
    {
      round: 0,
      name: 'Play-In',
      matchups: [
        { id: 'R0-G1', topSeed: 6, bottomSeed: 7, topFromMatchup: null, bottomFromMatchup: null },
      ],
    },
    {
      round: 1,
      name: 'Quarterfinals',
      matchups: [
        { id: 'R1-G1', topSeed: 3, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R0-G1' },
        { id: 'R1-G2', topSeed: 4, bottomSeed: 5, topFromMatchup: null, bottomFromMatchup: null },
      ],
    },
    {
      round: 2,
      name: 'Semifinals',
      matchups: [
        { id: 'R2-G1', topSeed: 1, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R1-G2' },
        { id: 'R2-G2', topSeed: 2, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R1-G1' },
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

// 8-team with top 2 seeds getting double bye to semifinals
// Used by: OVC (top 8), Big West (top 8), Southland (top 8)
const TEMPLATE_8_TEAM_TOP2_BYE: BracketTemplate = {
  id: '8-team-top2-bye',
  name: '8-Team (Top 2 Bye to Semis)',
  teamCount: 8,
  rounds: [
    {
      round: 1,
      name: 'First Round',
      matchups: [
        { id: 'R1-G1', topSeed: 5, bottomSeed: 8, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R1-G2', topSeed: 6, bottomSeed: 7, topFromMatchup: null, bottomFromMatchup: null },
      ],
    },
    {
      round: 2,
      name: 'Quarterfinals',
      matchups: [
        { id: 'R2-G1', topSeed: 4, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R1-G1' },
        { id: 'R2-G2', topSeed: 3, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R1-G2' },
      ],
    },
    {
      round: 3,
      name: 'Semifinals',
      matchups: [
        { id: 'R3-G1', topSeed: 1, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R2-G1' },
        { id: 'R3-G2', topSeed: 2, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R2-G2' },
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

// 9-team: Play-in 8v9, then standard 8-team quarterfinal bracket
// Used by: Summit League
const TEMPLATE_9_TEAM: BracketTemplate = {
  id: '9-team',
  name: '9-Team (8v9 Play-In)',
  teamCount: 9,
  rounds: [
    {
      round: 0,
      name: 'Play-In',
      matchups: [
        { id: 'R0-G1', topSeed: 8, bottomSeed: 9, topFromMatchup: null, bottomFromMatchup: null },
      ],
    },
    {
      round: 1,
      name: 'Quarterfinals',
      matchups: [
        { id: 'R1-G1', topSeed: 1, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R0-G1' },
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

// 10-team stepladder: pairs of seeds enter each round
// Used by: AAC (top 10)
const TEMPLATE_10_TEAM_STEPLADDER: BracketTemplate = {
  id: '10-team-stepladder',
  name: '10-Team Stepladder',
  teamCount: 10,
  rounds: [
    {
      round: 1,
      name: 'First Round',
      matchups: [
        { id: 'R1-G1', topSeed: 7, bottomSeed: 10, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R1-G2', topSeed: 8, bottomSeed: 9, topFromMatchup: null, bottomFromMatchup: null },
      ],
    },
    {
      round: 2,
      name: 'Second Round',
      matchups: [
        { id: 'R2-G1', topSeed: 6, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R1-G1' },
        { id: 'R2-G2', topSeed: 5, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R1-G2' },
      ],
    },
    {
      round: 3,
      name: 'Quarterfinals',
      matchups: [
        { id: 'R3-G1', topSeed: 4, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R2-G1' },
        { id: 'R3-G2', topSeed: 3, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R2-G2' },
      ],
    },
    {
      round: 4,
      name: 'Semifinals',
      matchups: [
        { id: 'R4-G1', topSeed: 2, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R3-G1' },
        { id: 'R4-G2', topSeed: 1, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R3-G2' },
      ],
    },
    {
      round: 5,
      name: 'Championship',
      matchups: [
        { id: 'R5-G1', topSeed: null, bottomSeed: null, topFromMatchup: 'R4-G2', bottomFromMatchup: 'R4-G1' },
      ],
    },
  ],
};

// 11-team: 3 first-round games (6v11, 7v10, 8v9), top 5 bye to QF
// Used by: Big East, MVC
const TEMPLATE_11_TEAM: BracketTemplate = {
  id: '11-team',
  name: '11-Team (Top 5 Bye)',
  teamCount: 11,
  rounds: [
    {
      round: 1,
      name: 'First Round',
      matchups: [
        { id: 'R1-G1', topSeed: 8, bottomSeed: 9, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R1-G2', topSeed: 6, bottomSeed: 11, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R1-G3', topSeed: 7, bottomSeed: 10, topFromMatchup: null, bottomFromMatchup: null },
      ],
    },
    {
      round: 2,
      name: 'Quarterfinals',
      matchups: [
        { id: 'R2-G1', topSeed: 1, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R1-G1' },
        { id: 'R2-G2', topSeed: 4, bottomSeed: 5, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R2-G3', topSeed: 3, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R1-G2' },
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

// 11-team with play-in and top-2 bye to semifinals
// Used by: Horizon League
const TEMPLATE_11_TEAM_TOP2_BYE: BracketTemplate = {
  id: '11-team-top2-bye',
  name: '11-Team (Top 2 Bye to Semis)',
  teamCount: 11,
  rounds: [
    {
      round: 0,
      name: 'Play-In',
      matchups: [
        { id: 'R0-G1', topSeed: 10, bottomSeed: 11, topFromMatchup: null, bottomFromMatchup: null },
      ],
    },
    {
      round: 1,
      name: 'First Round',
      matchups: [
        { id: 'R1-G1', topSeed: 9, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R0-G1' },
        { id: 'R1-G2', topSeed: 3, bottomSeed: 8, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R1-G3', topSeed: 4, bottomSeed: 7, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R1-G4', topSeed: 5, bottomSeed: 6, topFromMatchup: null, bottomFromMatchup: null },
      ],
    },
    {
      round: 2,
      name: 'Quarterfinals',
      matchups: [
        { id: 'R2-G1', topSeed: null, bottomSeed: null, topFromMatchup: 'R1-G1', bottomFromMatchup: 'R1-G2' },
        { id: 'R2-G2', topSeed: null, bottomSeed: null, topFromMatchup: 'R1-G3', bottomFromMatchup: 'R1-G4' },
      ],
    },
    {
      round: 3,
      name: 'Semifinals',
      matchups: [
        { id: 'R3-G1', topSeed: 1, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R2-G1' },
        { id: 'R3-G2', topSeed: 2, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R2-G2' },
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

// 12-team stepladder: pairs of seeds enter each round
// Used by: WCC
const TEMPLATE_12_TEAM_STEPLADDER: BracketTemplate = {
  id: '12-team-stepladder',
  name: '12-Team Stepladder',
  teamCount: 12,
  rounds: [
    {
      round: 1,
      name: 'First Round',
      matchups: [
        { id: 'R1-G1', topSeed: 9, bottomSeed: 12, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R1-G2', topSeed: 10, bottomSeed: 11, topFromMatchup: null, bottomFromMatchup: null },
      ],
    },
    {
      round: 2,
      name: 'Second Round',
      matchups: [
        { id: 'R2-G1', topSeed: 8, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R1-G1' },
        { id: 'R2-G2', topSeed: 7, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R1-G2' },
      ],
    },
    {
      round: 3,
      name: 'Third Round',
      matchups: [
        { id: 'R3-G1', topSeed: 6, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R2-G1' },
        { id: 'R3-G2', topSeed: 5, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R2-G2' },
      ],
    },
    {
      round: 4,
      name: 'Quarterfinals',
      matchups: [
        { id: 'R4-G1', topSeed: 4, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R3-G1' },
        { id: 'R4-G2', topSeed: 3, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R3-G2' },
      ],
    },
    {
      round: 5,
      name: 'Semifinals',
      matchups: [
        { id: 'R5-G1', topSeed: 2, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R4-G1' },
        { id: 'R5-G2', topSeed: 1, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R4-G2' },
      ],
    },
    {
      round: 6,
      name: 'Championship',
      matchups: [
        { id: 'R6-G1', topSeed: null, bottomSeed: null, topFromMatchup: 'R5-G2', bottomFromMatchup: 'R5-G1' },
      ],
    },
  ],
};

// 12-team with top 6 getting bye to quarterfinals
// Seeds 9-12 play first round, winners face 7-8, then into QF
// Used by: SWAC
const TEMPLATE_12_TEAM_TOP6_BYE: BracketTemplate = {
  id: '12-team-top6-bye',
  name: '12-Team (Top 6 Bye to QF)',
  teamCount: 12,
  rounds: [
    {
      round: 1,
      name: 'First Round',
      matchups: [
        { id: 'R1-G1', topSeed: 9, bottomSeed: 12, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R1-G2', topSeed: 10, bottomSeed: 11, topFromMatchup: null, bottomFromMatchup: null },
      ],
    },
    {
      round: 2,
      name: 'Second Round',
      matchups: [
        { id: 'R2-G1', topSeed: 8, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R1-G1' },
        { id: 'R2-G2', topSeed: 7, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R1-G2' },
      ],
    },
    {
      round: 3,
      name: 'Quarterfinals',
      matchups: [
        { id: 'R3-G1', topSeed: 1, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R2-G1' },
        { id: 'R3-G2', topSeed: 4, bottomSeed: 5, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R3-G3', topSeed: 3, bottomSeed: 6, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R3-G4', topSeed: 2, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R2-G2' },
      ],
    },
    {
      round: 4,
      name: 'Semifinals',
      matchups: [
        { id: 'R4-G1', topSeed: null, bottomSeed: null, topFromMatchup: 'R3-G1', bottomFromMatchup: 'R3-G2' },
        { id: 'R4-G2', topSeed: null, bottomSeed: null, topFromMatchup: 'R3-G3', bottomFromMatchup: 'R3-G4' },
      ],
    },
    {
      round: 5,
      name: 'Championship',
      matchups: [
        { id: 'R5-G1', topSeed: null, bottomSeed: null, topFromMatchup: 'R4-G1', bottomFromMatchup: 'R4-G2' },
      ],
    },
  ],
};

// 13-team: Opening round 12v13, first round (5-11), QF (1-4 double bye)
// Used by: CAA
const TEMPLATE_13_TEAM: BracketTemplate = {
  id: '13-team',
  name: '13-Team (Top 4 Double Bye)',
  teamCount: 13,
  rounds: [
    {
      round: 0,
      name: 'Opening Round',
      matchups: [
        { id: 'R0-G1', topSeed: 12, bottomSeed: 13, topFromMatchup: null, bottomFromMatchup: null },
      ],
    },
    {
      round: 1,
      name: 'First Round',
      matchups: [
        { id: 'R1-G1', topSeed: 8, bottomSeed: 9, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R1-G2', topSeed: 5, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R0-G1' },
        { id: 'R1-G3', topSeed: 6, bottomSeed: 11, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R1-G4', topSeed: 7, bottomSeed: 10, topFromMatchup: null, bottomFromMatchup: null },
      ],
    },
    {
      round: 2,
      name: 'Quarterfinals',
      matchups: [
        { id: 'R2-G1', topSeed: 1, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R1-G1' },
        { id: 'R2-G2', topSeed: 4, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R1-G2' },
        { id: 'R2-G3', topSeed: 3, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R1-G3' },
        { id: 'R2-G4', topSeed: 2, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R1-G4' },
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

// 14-team with top 4 getting double bye to quarterfinals
// Used by: A10
const TEMPLATE_14_TEAM_TOP4_DBL: BracketTemplate = {
  id: '14-team-top4-dbl',
  name: '14-Team (Top 4 Double Bye)',
  teamCount: 14,
  rounds: [
    {
      round: 1,
      name: 'First Round',
      matchups: [
        { id: 'R1-G1', topSeed: 11, bottomSeed: 14, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R1-G2', topSeed: 12, bottomSeed: 13, topFromMatchup: null, bottomFromMatchup: null },
      ],
    },
    {
      round: 2,
      name: 'Second Round',
      matchups: [
        { id: 'R2-G1', topSeed: 8, bottomSeed: 9, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R2-G2', topSeed: 5, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R1-G2' },
        { id: 'R2-G3', topSeed: 6, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R1-G1' },
        { id: 'R2-G4', topSeed: 7, bottomSeed: 10, topFromMatchup: null, bottomFromMatchup: null },
      ],
    },
    {
      round: 3,
      name: 'Quarterfinals',
      matchups: [
        { id: 'R3-G1', topSeed: 1, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R2-G1' },
        { id: 'R3-G2', topSeed: 4, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R2-G2' },
        { id: 'R3-G3', topSeed: 3, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R2-G3' },
        { id: 'R3-G4', topSeed: 2, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R2-G4' },
      ],
    },
    {
      round: 4,
      name: 'Semifinals',
      matchups: [
        { id: 'R4-G1', topSeed: null, bottomSeed: null, topFromMatchup: 'R3-G1', bottomFromMatchup: 'R3-G2' },
        { id: 'R4-G2', topSeed: null, bottomSeed: null, topFromMatchup: 'R3-G3', bottomFromMatchup: 'R3-G4' },
      ],
    },
    {
      round: 5,
      name: 'Championship',
      matchups: [
        { id: 'R5-G1', topSeed: null, bottomSeed: null, topFromMatchup: 'R4-G1', bottomFromMatchup: 'R4-G2' },
      ],
    },
  ],
};

// 14-team with top 2 getting bye to semifinals, 3-4 to QF
// Used by: Sun Belt
const TEMPLATE_14_TEAM_TOP2_SEMIS: BracketTemplate = {
  id: '14-team-top2-semis',
  name: '14-Team (Top 2 Bye to Semis)',
  teamCount: 14,
  rounds: [
    {
      round: 1,
      name: 'First Round',
      matchups: [
        { id: 'R1-G1', topSeed: 11, bottomSeed: 14, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R1-G2', topSeed: 12, bottomSeed: 13, topFromMatchup: null, bottomFromMatchup: null },
      ],
    },
    {
      round: 2,
      name: 'Second Round',
      matchups: [
        { id: 'R2-G1', topSeed: 6, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R1-G1' },
        { id: 'R2-G2', topSeed: 7, bottomSeed: 10, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R2-G3', topSeed: 5, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R1-G2' },
        { id: 'R2-G4', topSeed: 8, bottomSeed: 9, topFromMatchup: null, bottomFromMatchup: null },
      ],
    },
    {
      round: 3,
      name: 'Third Round',
      matchups: [
        { id: 'R3-G1', topSeed: null, bottomSeed: null, topFromMatchup: 'R2-G1', bottomFromMatchup: 'R2-G2' },
        { id: 'R3-G2', topSeed: null, bottomSeed: null, topFromMatchup: 'R2-G3', bottomFromMatchup: 'R2-G4' },
      ],
    },
    {
      round: 4,
      name: 'Quarterfinals',
      matchups: [
        { id: 'R4-G1', topSeed: 3, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R3-G1' },
        { id: 'R4-G2', topSeed: 4, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R3-G2' },
      ],
    },
    {
      round: 5,
      name: 'Semifinals',
      matchups: [
        { id: 'R5-G1', topSeed: 1, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R4-G1' },
        { id: 'R5-G2', topSeed: 2, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R4-G2' },
      ],
    },
    {
      round: 6,
      name: 'Championship',
      matchups: [
        { id: 'R6-G1', topSeed: null, bottomSeed: null, topFromMatchup: 'R5-G1', bottomFromMatchup: 'R5-G2' },
      ],
    },
  ],
};

// 15-team: Bottom 3 excluded, top 4 double bye, 5-9 single bye, 10-15 first round
// Used by: ACC (18 members, 15 in tournament)
const TEMPLATE_15_TEAM: BracketTemplate = {
  id: '15-team',
  name: '15-Team (Top 4 Double Bye)',
  teamCount: 15,
  rounds: [
    {
      round: 1,
      name: 'First Round',
      matchups: [
        { id: 'R1-G1', topSeed: 10, bottomSeed: 15, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R1-G2', topSeed: 11, bottomSeed: 14, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R1-G3', topSeed: 12, bottomSeed: 13, topFromMatchup: null, bottomFromMatchup: null },
      ],
    },
    {
      round: 2,
      name: 'Second Round',
      matchups: [
        { id: 'R2-G1', topSeed: 8, bottomSeed: 9, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R2-G2', topSeed: 5, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R1-G3' },
        { id: 'R2-G3', topSeed: 6, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R1-G2' },
        { id: 'R2-G4', topSeed: 7, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R1-G1' },
      ],
    },
    {
      round: 3,
      name: 'Quarterfinals',
      matchups: [
        { id: 'R3-G1', topSeed: 1, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R2-G1' },
        { id: 'R3-G2', topSeed: 4, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R2-G2' },
        { id: 'R3-G3', topSeed: 3, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R2-G3' },
        { id: 'R3-G4', topSeed: 2, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R2-G4' },
      ],
    },
    {
      round: 4,
      name: 'Semifinals',
      matchups: [
        { id: 'R4-G1', topSeed: null, bottomSeed: null, topFromMatchup: 'R3-G1', bottomFromMatchup: 'R3-G2' },
        { id: 'R4-G2', topSeed: null, bottomSeed: null, topFromMatchup: 'R3-G3', bottomFromMatchup: 'R3-G4' },
      ],
    },
    {
      round: 5,
      name: 'Championship',
      matchups: [
        { id: 'R5-G1', topSeed: null, bottomSeed: null, topFromMatchup: 'R4-G1', bottomFromMatchup: 'R4-G2' },
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

// 18-team: All teams play, staggered byes
// Seeds 1-4 triple bye to QF, 5-8 double bye, 9-14 single bye, 15-18 first round
// Used by: Big Ten
const TEMPLATE_18_TEAM: BracketTemplate = {
  id: '18-team',
  name: '18-Team (Staggered Byes)',
  teamCount: 18,
  rounds: [
    {
      round: 1,
      name: 'First Round',
      matchups: [
        { id: 'R1-G1', topSeed: 16, bottomSeed: 17, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R1-G2', topSeed: 15, bottomSeed: 18, topFromMatchup: null, bottomFromMatchup: null },
      ],
    },
    {
      round: 2,
      name: 'Second Round',
      matchups: [
        { id: 'R2-G1', topSeed: 9, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R1-G1' },
        { id: 'R2-G2', topSeed: 12, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R1-G2' },
        { id: 'R2-G3', topSeed: 10, bottomSeed: 13, topFromMatchup: null, bottomFromMatchup: null },
        { id: 'R2-G4', topSeed: 11, bottomSeed: 14, topFromMatchup: null, bottomFromMatchup: null },
      ],
    },
    {
      round: 3,
      name: 'Third Round',
      matchups: [
        { id: 'R3-G1', topSeed: 8, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R2-G1' },
        { id: 'R3-G2', topSeed: 5, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R2-G2' },
        { id: 'R3-G3', topSeed: 6, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R2-G3' },
        { id: 'R3-G4', topSeed: 7, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R2-G4' },
      ],
    },
    {
      round: 4,
      name: 'Quarterfinals',
      matchups: [
        { id: 'R4-G1', topSeed: 1, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R3-G1' },
        { id: 'R4-G2', topSeed: 4, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R3-G2' },
        { id: 'R4-G3', topSeed: 3, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R3-G3' },
        { id: 'R4-G4', topSeed: 2, bottomSeed: null, topFromMatchup: null, bottomFromMatchup: 'R3-G4' },
      ],
    },
    {
      round: 5,
      name: 'Semifinals',
      matchups: [
        { id: 'R5-G1', topSeed: null, bottomSeed: null, topFromMatchup: 'R4-G1', bottomFromMatchup: 'R4-G2' },
        { id: 'R5-G2', topSeed: null, bottomSeed: null, topFromMatchup: 'R4-G3', bottomFromMatchup: 'R4-G4' },
      ],
    },
    {
      round: 6,
      name: 'Championship',
      matchups: [
        { id: 'R6-G1', topSeed: null, bottomSeed: null, topFromMatchup: 'R5-G1', bottomFromMatchup: 'R5-G2' },
      ],
    },
  ],
};

// ============================================
// Template Registry
// ============================================

export const BRACKET_TEMPLATES: Record<string, BracketTemplate> = {
  '4-team': TEMPLATE_4_TEAM,
  '7-team': TEMPLATE_7_TEAM,
  '8-team': TEMPLATE_8_TEAM,
  '8-team-top2-bye': TEMPLATE_8_TEAM_TOP2_BYE,
  '9-team': TEMPLATE_9_TEAM,
  '10-team': TEMPLATE_10_TEAM,
  '10-team-stepladder': TEMPLATE_10_TEAM_STEPLADDER,
  '11-team': TEMPLATE_11_TEAM,
  '11-team-top2-bye': TEMPLATE_11_TEAM_TOP2_BYE,
  '12-team-top4-bye': TEMPLATE_12_TEAM_TOP4_BYE,
  '12-team-stepladder': TEMPLATE_12_TEAM_STEPLADDER,
  '12-team-top6-bye': TEMPLATE_12_TEAM_TOP6_BYE,
  '13-team': TEMPLATE_13_TEAM,
  '14-team-top4-dbl': TEMPLATE_14_TEAM_TOP4_DBL,
  '14-team-top2-semis': TEMPLATE_14_TEAM_TOP2_SEMIS,
  '15-team': TEMPLATE_15_TEAM,
  '16-team': TEMPLATE_16_TEAM,
  '18-team': TEMPLATE_18_TEAM,
};

export const ALL_TEMPLATES = Object.values(BRACKET_TEMPLATES);

// ============================================
// Conference Defaults (2025-26 season)
// ============================================

export const CONFERENCE_DEFAULTS: Record<string, { templateId: string; name: string }> = {
  // Power conferences
  'B12': { templateId: '16-team', name: 'Big 12 Tournament' },
  'SEC': { templateId: '16-team', name: 'SEC Tournament' },
  'ACC': { templateId: '15-team', name: 'ACC Tournament' },
  'B10': { templateId: '18-team', name: 'Big Ten Tournament' },
  // Major conferences
  'BE':   { templateId: '11-team', name: 'Big East Tournament' },
  'AAC':  { templateId: '10-team-stepladder', name: 'AAC Tournament' },
  'A10':  { templateId: '14-team-top4-dbl', name: 'Atlantic 10 Tournament' },
  'MWC':  { templateId: '12-team-top4-bye', name: 'Mountain West Tournament' },
  'CUSA': { templateId: '12-team-top4-bye', name: 'Conference USA Tournament' },
  'WCC':  { templateId: '12-team-stepladder', name: 'WCC Tournament' },
  'MVC':  { templateId: '11-team', name: 'MVC Tournament' },
  'CAA':  { templateId: '13-team', name: 'CAA Tournament' },
  'SB':   { templateId: '14-team-top2-semis', name: 'Sun Belt Tournament' },
  // Mid-major conferences
  'MAC':  { templateId: '8-team', name: 'MAC Tournament' },
  'BSky': { templateId: '10-team', name: 'Big Sky Tournament' },
  'SC':   { templateId: '10-team', name: 'SoCon Tournament' },
  'OVC':  { templateId: '8-team-top2-bye', name: 'OVC Tournament' },
  'Horz': { templateId: '11-team-top2-bye', name: 'Horizon League Tournament' },
  'ASun': { templateId: '12-team-top4-bye', name: 'ASUN Tournament' },
  'BW':   { templateId: '8-team-top2-bye', name: 'Big West Tournament' },
  'WAC':  { templateId: '7-team', name: 'WAC Tournament' },
  'AE':   { templateId: '8-team', name: 'America East Tournament' },
  'Sum':  { templateId: '9-team', name: 'Summit League Tournament' },
  'Pat':  { templateId: '10-team', name: 'Patriot League Tournament' },
  'MAAC': { templateId: '10-team', name: 'MAAC Tournament' },
  // Small conferences
  'NEC':  { templateId: '8-team', name: 'NEC Tournament' },
  'MEAC': { templateId: '7-team', name: 'MEAC Tournament' },
  'SWAC': { templateId: '12-team-top6-bye', name: 'SWAC Tournament' },
  'Slnd': { templateId: '8-team-top2-bye', name: 'Southland Tournament' },
  // Ivy League
  'Ivy':  { templateId: '4-team', name: 'Ivy League Tournament' },
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
