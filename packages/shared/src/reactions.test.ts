import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { nextTurn, startCombat } from './combat.ts';
import { resolveCreature } from './creature.ts';
import { opportunityAttackers } from './reactions.ts';
import { TokenSchema, type Token } from './schema.ts';

const G = 100;
const at = (col: number, row: number) => [(col + 0.5) * G, (row + 0.5) * G] as [number, number];
const hero = (data: object = {}) =>
  TokenSchema.parse({
    id: 'hero',
    name: 'Hero',
    x: at(0, 0)[0],
    y: at(0, 0)[1],
    controllers: ['ana'],
    stats: { level: 1 },
    ...data,
  });
const goblin = (id: string, col: number, data: object = {}) =>
  TokenSchema.parse({ id, name: id, x: at(col, 0)[0], y: at(col, 0)[1], monster: 'goblin', ...data });
const fighters = (tokens: Token[]) =>
  tokens.map((token) => ({ token, sheet: resolveCreature(token, srdFor('2014'))! }));

describe('opportunity attacks', () => {
  it('lets enemies whose reach the mover leaves attack it', () => {
    const others = fighters([goblin('near', 1), goblin('far', 5)]);
    const path = [at(0, 0), at(0, 1), at(0, 2)];
    expect(opportunityAttackers({ mover: hero(), path, others, gridSize: G, reacted: [] })).toEqual(['near']);
  });

  it('spares a creature that stays in reach, disengages, or meets allies; and enemies that already reacted', () => {
    const others = fighters([goblin('near', 1)]);
    const stay = [at(0, 0), at(0, 1)];
    expect(opportunityAttackers({ mover: hero(), path: stay, others, gridSize: G, reacted: [] })).toEqual([]);
    const away = [at(0, 0), at(0, 1), at(0, 2)];
    const disengaged = hero({ effects: [{ id: 'd', name: 'Disengaged', disengaged: true }] });
    expect(opportunityAttackers({ mover: disengaged, path: away, others, gridSize: G, reacted: [] })).toEqual([]);
    expect(opportunityAttackers({ mover: hero(), path: away, others, gridSize: G, reacted: ['near'] })).toEqual([]);
    const friend = fighters([goblin('pal', 1, { controllers: ['bo'] })]);
    expect(opportunityAttackers({ mover: hero(), path: away, others: friend, gridSize: G, reacted: [] })).toEqual([]);
  });
});

describe('reactions in the turn order', () => {
  it('gives a creature its reaction back when its own turn starts', () => {
    const combat = startCombat(
      [
        { token: 'a', bonus: 5, speed: 30 },
        { token: 'b', bonus: 0, speed: 30 },
      ],
      () => 0.5,
    );
    const next = nextTurn({ ...combat, reacted: ['a', 'b'] }, () => ({ speed: 30, active: true }));
    expect(next.reacted).toEqual(['a']);
  });
});
