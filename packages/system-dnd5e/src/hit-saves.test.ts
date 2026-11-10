import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { hitSave } from './hit-saves.ts';
import type { Attack } from './stats-schema.ts';
import { type Token, TokenSchema } from './token-schema.ts';

const ghoul = TokenSchema.parse({ id: 'ghoul', name: 'Ghoul', x: 50, y: 50, monster: 'ghoul' });
const pc = (data: object = {}) =>
  TokenSchema.parse({
    id: 'pc',
    name: 'PC',
    x: 150,
    y: 50,
    stats: { class: 'wizard', level: 3, maxHp: 20, abilities: { con: 10, dex: 10 } },
    ...data,
  });
const side = (t: Token) => ({ token: t, sheet: resolveCreature(t, srdFor('2014'))! });
const face = (n: number, sides: number) => (n - 1) / sides + 0.001;
const rngOf = (values: number[]) => () => values.shift() ?? 0.001;

const base: Attack = { name: 'Claws', kind: 'melee', toHit: 4, damage: [{ dice: '2d4+2', type: 'slashing' }] };
const claws: Attack = {
  ...base,
  onHit: { save: { ability: 'con', dc: 10 }, conditions: ['paralyzed'], rounds: 10, repeatSave: true },
};
const bite: Attack = {
  ...base,
  name: 'Bite',
  onHit: { save: { ability: 'con', dc: 11 }, damage: [{ dice: '2d8', type: 'poison' }], half: true },
};
const hit = (attack: Attack, target: Token, rng: number[], crit = false) =>
  hitSave({ attacker: side(ghoul), target: side(target), attack, crit }, rngOf(rng));

describe('what rides on a monster’s hit behind a saving throw', () => {
  it('paralyses a target that fails, for a minute with a save at the end of each turn', () => {
    const out = hit(claws, pc(), [face(5, 20)]);
    expect(out.effects).toEqual([
      expect.objectContaining({
        name: 'Paralyzed',
        conditions: ['paralyzed'],
        rounds: 10,
        repeatSave: true,
        save: { ability: 'con', dc: 10 },
        source: 'ghoul',
      }),
    ]);
    expect(out.notes).toEqual(['PC: CON save 5 vs DC 10, failed: Paralyzed']);
  });

  it('leaves a target that saves alone', () => {
    const out = hit(claws, pc(), [face(15, 20)]);
    expect(out.effects).toEqual([]);
    expect(out.notes).toEqual(['PC: CON save 15 vs DC 10, saved']);
  });

  it('deals its extra damage in full on a failure and half on a success', () => {
    const failed = hit(bite, pc(), [face(3, 20), face(8, 8), face(8, 8)]);
    expect(failed.damage).toEqual([expect.objectContaining({ type: 'poison' })]);
    expect(failed.damage[0]!.roll.total).toBe(16);
    const saved = hit(bite, pc(), [face(18, 20), face(8, 8), face(7, 8)]);
    expect(saved.damage[0]!.roll.total).toBe(7);
  });

  it('deals nothing extra on a success when the save negates', () => {
    const all: Attack = { ...bite, onHit: { ...bite.onHit!, half: false } };
    expect(hit(all, pc(), [face(18, 20)]).damage).toEqual([]);
  });

  it('doubles the extra dice on a critical hit', () => {
    const out = hit(bite, pc(), [face(3, 20), ...[8, 8, 8, 8].map((n) => face(n, 8))], true);
    expect(out.damage[0]!.roll.total).toBe(32);
  });

  it('puts a condition with no save straight on, but not on a creature too big for it', () => {
    const slam: Attack = { ...base, onHit: { conditions: ['prone'], maxSize: 2 } };
    expect(hit(slam, pc(), []).effects[0]).toMatchObject({ name: 'Prone', conditions: ['prone'] });
    expect(hit(slam, pc({ size: 3 }), []).effects).toEqual([]);
  });

  it('does nothing for an attack with no rider', () => {
    expect(hit(base, pc(), [])).toEqual({ damage: [], effects: [], notes: [] });
  });
});
