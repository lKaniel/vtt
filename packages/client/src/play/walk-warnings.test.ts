import { describe, expect, it } from 'vitest';
import type { Region } from '@vtt/shared';
import { type Combat, TokenSchema, type TokenView } from '@vtt/system-dnd5e';
import { walkWarnings } from './walk-warnings.ts';

const G = 100;
const hero: TokenView = TokenSchema.parse({
  id: 'hero',
  name: 'Hero',
  x: 50,
  y: 50,
  size: 1,
  ownership: { default: 'limited', ana: 'owner' },
});
const goblin: TokenView = {
  ...TokenSchema.parse({ id: 'gob', name: 'Goblin', x: 150, y: 50, size: 1 }),
  health: 'unhurt',
};
const path: [number, number][] = [
  [50, 50],
  [50, 150],
  [50, 250],
  [50, 350],
];
const base = { mover: hero, path, gridSize: G, grid: 'none' as const, tokens: [hero, goblin], regions: [], feet: 15 };
const fight = { round: 1, turn: 0, order: [], left: {}, side: {}, reacted: [] } as unknown as Combat;

describe('walkWarnings', () => {
  it('warns of an opportunity attack in a fight, where the walk leaves the reach', () => {
    const warnings = walkWarnings({ ...base, combat: fight, budget: 30 });
    expect(warnings).toEqual([{ kind: 'opportunity', name: 'Goblin', at: [50, 175], from: [150, 50] }]);
  });

  it('says nothing of reach outside a fight, or of a foe that is down or already reacted', () => {
    expect(walkWarnings({ ...base, combat: null, budget: Infinity })).toEqual([]);
    const down = { ...goblin, health: 'down' as const };
    expect(walkWarnings({ ...base, tokens: [hero, down], combat: fight, budget: 30 })).toEqual([]);
    expect(walkWarnings({ ...base, combat: { ...fight, reacted: ['gob'] }, budget: 30 })).toEqual([]);
  });

  it('warns when the walk is longer than the movement left, and where it runs out', () => {
    const [warning] = walkWarnings({ ...base, tokens: [hero], combat: null, budget: 10 });
    expect(warning).toMatchObject({ kind: 'tooFar', at: [50, 250] });
    expect(warning?.kind === 'tooFar' && warning.reach.at(0)).toEqual([50, 50]);
  });

  it('warns of difficult ground and of traps the player knows of', () => {
    const square = [
      [0, 190],
      [100, 190],
      [100, 300],
      [0, 300],
    ] as [number, number][];
    const regions: Region[] = [
      { id: 'mud', points: square, behaviors: [{ type: 'difficult' }] },
      { id: 'pit', name: 'Pit', points: square, behaviors: [{ type: 'trap' }] },
    ];
    const warnings = walkWarnings({ ...base, tokens: [hero], regions, combat: null, budget: Infinity });
    expect(warnings).toEqual([
      { kind: 'difficult', at: [50, 200] },
      { kind: 'trap', name: 'Pit', at: [50, 200] },
    ]);
  });
});
