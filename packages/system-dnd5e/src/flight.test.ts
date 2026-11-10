import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { keepsAloft } from './flight.ts';
import { TokenSchema } from './token-schema.ts';

const creature = (data: object) => {
  const token = TokenSchema.parse({ id: 'c', name: 'C', x: 50, y: 50, elevation: 30, ...data });
  return { token, sheet: resolveCreature(token, srdFor('2014'))! };
};
const flying = { id: 'fly', name: 'Fly', speeds: { fly: 60 } };
const prone = { id: 'prone', name: 'Prone', conditions: ['prone'] };

describe('staying in the air', () => {
  it('a creature that can fly stays up', () => {
    const { token, sheet } = creature({ monster: 'goblin', effects: [flying] });
    expect(keepsAloft(token, sheet)).toBe(true);
  });

  it('one that cannot fly falls', () => {
    const { token, sheet } = creature({ monster: 'goblin' });
    expect(keepsAloft(token, sheet)).toBe(false);
  });

  it('a flyer knocked prone or held still falls, unless it hovers', () => {
    expect(keepsAloft(...pair(creature({ monster: 'goblin', effects: [flying, prone] })))).toBe(false);
    const held = { id: 'held', name: 'Grappled', conditions: ['grappled'] };
    expect(keepsAloft(...pair(creature({ monster: 'goblin', effects: [flying, held] })))).toBe(false);
    const hover = { ...flying, speeds: { fly: 60, hover: true } };
    expect(keepsAloft(...pair(creature({ monster: 'goblin', effects: [hover, prone] })))).toBe(true);
  });

  it('a creature a spell holds up stays there', () => {
    expect(keepsAloft(...pair(creature({ monster: 'goblin', aloft: 30 })))).toBe(true);
  });
});

function pair({ token, sheet }: ReturnType<typeof creature>) {
  return [token, sheet] as const;
}
