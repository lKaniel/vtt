import { describe, expect, it } from 'vitest';
import { GameSchema, membersAfter, newGameIssues, nextSeatColor } from './index.ts';

const seats = [
  { id: 'kaniel', name: 'Kaniel', role: 'gm' as const, color: '#e0b040' },
  { id: 'ana', name: 'Ana', role: 'player' as const, color: '#5a9be0' },
];

describe('systems', () => {
  it('is what an old game.json without one plays', () => {
    const game = GameSchema.parse({ id: 'old', name: 'Old', scene: 'main', players: seats });
    expect(game.system).toBe('dnd5e');
  });
});

describe('a new game', () => {
  it('needs a name, a known system and one of its editions', () => {
    const systems = [
      {
        id: 'dnd5e',
        name: 'D&D',
        editions: [
          { id: '2014', name: '2014' },
          { id: '2024', name: '2024' },
        ],
      },
    ];
    expect(newGameIssues({ name: 'Lost Mine', system: 'dnd5e', rules: '2024' }, systems)).toEqual([]);
    expect(newGameIssues({ name: '  ', system: 'dnd5e', rules: '2014' }, systems)).toEqual(['Give the game a name.']);
    expect(newGameIssues({ name: 'X', system: 'gurps', rules: '2014' }, systems)).toEqual(['Pick a system.']);
    expect(newGameIssues({ name: 'X', system: 'dnd5e', rules: '1977' }, systems)).toEqual(['D&D has no 1977 rules.']);
  });

  it('gives each new seat a colour nobody else has', () => {
    expect(nextSeatColor(seats)).not.toBe('#e0b040');
    expect(nextSeatColor(seats)).not.toBe('#5a9be0');
  });
});

describe('changing who is in a game', () => {
  it('changes a role or removes a member', () => {
    expect(membersAfter(seats, 'ana', 'trusted').find((p) => p.id === 'ana')?.role).toBe('trusted');
    expect(membersAfter(seats, 'ana', null).map((p) => p.id)).toEqual(['kaniel']);
  });

  it('never leaves a game without a GM', () => {
    expect(() => membersAfter(seats, 'kaniel', 'player')).toThrow(/GM/);
    expect(() => membersAfter(seats, 'kaniel', null)).toThrow(/GM/);
    expect(() => membersAfter(seats, 'nobody', null)).toThrow(/member/);
  });
});
