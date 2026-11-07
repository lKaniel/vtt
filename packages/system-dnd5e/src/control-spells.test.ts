import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { withGravity } from './gravity.ts';
import { resolveCast, withAgain } from './spells.ts';
import { type Token, TokenSchema } from './token-schema.ts';
import type { Edition } from './stats-schema.ts';

// Spells that move or hold creatures: reverse gravity, telekinesis and compulsion.

const book = (edition: Edition) => srdFor(edition);
const wizard = TokenSchema.parse({
  id: 'wiz',
  name: 'Wizard',
  x: 50,
  y: 50,
  stats: { class: 'wizard', level: 13, abilities: { int: 18 }, spells: ['reverse-gravity', 'telekinesis'] },
});
const ogre = (patch: Partial<Token> = {}) =>
  TokenSchema.parse({ id: 'ogre', name: 'Ogre', x: 250, y: 50, monster: 'ogre', ...patch });
const side = (token: Token, edition: Edition = '2014') => ({ token, sheet: resolveCreature(token, book(edition))! });
const cast = (id: string, rng: () => number, edition: Edition = '2014') =>
  resolveCast(
    {
      spell: book(edition).spells.get(id)!,
      slot: book(edition).spells.get(id)!.level,
      caster: side(wizard, edition),
      targets: [side(ogre(), edition)],
      gridSize: 100,
    },
    rng,
  ).results[0]!;

describe('reverse gravity', () => {
  it('lifts a creature that fails its save 100 ft, and drops it when it ends', () => {
    const { effect } = cast('reverse-gravity', () => 0.01);
    expect(effect).toMatchObject({ lifted: 100 });
    const up = withGravity(ogre({ effects: [effect!] }))!;
    expect(up.token).toMatchObject({ elevation: 100, aloft: 100 });
    expect(up.fell).toBeUndefined();
    const down = withGravity({ ...up.token, effects: undefined })!;
    expect(down.token.elevation ?? 0).toBe(0);
    expect(down.token.aloft).toBeUndefined();
    expect(down.fell).toBe(100);
    expect(withGravity(ogre())).toBeUndefined();
  });
});

describe('telekinesis', () => {
  it('2014: a Strength check against the caster’s spellcasting check, then restrained', () => {
    const held = cast('telekinesis', () => 0.5);
    // Wizard 11 + 4 = 15 against the ogre's 11 + 4 = 15: a tie keeps the ogre free.
    expect(held.save).toMatchObject({ ability: 'str', dc: 15, total: 15, success: true });
    const lost = cast(
      'telekinesis',
      (() => {
        const faces = [0.99, 0.01];
        return () => faces.shift() ?? 0.5;
      })(),
    );
    expect(lost.effect?.conditions).toEqual(['restrained']);
  });
});

describe('compulsion', () => {
  it('used again, it steers the creatures it holds toward a point', () => {
    const spell = book('2014').spells.get('compulsion')!;
    expect(spell.effect).toMatchObject({ repeatSave: true });
    expect(spell.repeat).toBe('bonus');
    expect(withAgain(spell).steer).toBe(true);
  });
});
