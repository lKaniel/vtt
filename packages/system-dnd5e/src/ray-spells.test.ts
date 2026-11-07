import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { endOfTurnSaves } from './features.ts';
import { resolveCast } from './spells.ts';
import { type Token, TokenSchema } from './token-schema.ts';
import type { Edition } from './stats-schema.ts';

// Prismatic spray: a random ray for each creature, two on the top face; and
// saves tallied to three (its indigo ray, flesh to stone).

const book = (edition: Edition) => srdFor(edition);
const wizard = TokenSchema.parse({
  id: 'wiz',
  name: 'Wizard',
  x: 50,
  y: 50,
  stats: { class: 'wizard', level: 13, abilities: { int: 18 }, spells: ['prismatic-spray', 'flesh-to-stone'] },
});
const ogre = (patch: Partial<Token> = {}) =>
  TokenSchema.parse({ id: 'ogre', name: 'Ogre', x: 250, y: 50, monster: 'ogre', ...patch });
const side = (token: Token, edition: Edition = '2014') => ({ token, sheet: resolveCreature(token, book(edition))! });
const queue =
  (...faces: number[]) =>
  () =>
    faces.shift() ?? 0.01;
const spray = (rng: () => number, edition: Edition = '2014') =>
  resolveCast(
    {
      spell: book(edition).spells.get('prismatic-spray')!,
      slot: 7,
      caster: side(wizard, edition),
      targets: [side(ogre(), edition)],
      gridSize: 100,
    },
    rng,
  ).results;

describe('prismatic spray', () => {
  it('rolls a ray for each creature: 1 is fire', () => {
    const [hit] = spray(queue(0));
    expect(hit!.parts.map((p) => p.type)).toEqual(['fire']);
  });

  it('the top face strikes with two rays', () => {
    const results = spray(queue(0.99, 0, 0.2));
    expect(results.map((r) => r.parts.map((p) => p.type))).toEqual([['fire'], ['acid']]);
  });

  it('indigo restrains, violet blinds', () => {
    expect(spray(queue(0.7))[0]!.effect).toMatchObject({ conditions: ['restrained'], save: { ability: 'con' } });
    expect(spray(queue(0.8))[0]!.effect).toMatchObject({ conditions: ['blinded'] });
  });

  it('2024 rays deal 12d6', () => {
    const rays = book('2024').spells.get('prismatic-spray')!.rays!;
    expect(rays[0]!.set).toMatchObject({ damage: [{ dice: '12d6', type: 'fire' }] });
  });
});

describe('saves tallied to three', () => {
  const [stoned] = resolveCast(
    {
      spell: book('2014').spells.get('flesh-to-stone')!,
      slot: 6,
      caster: side(wizard),
      targets: [side(ogre())],
      gridSize: 100,
    },
    () => 0.01,
  ).results;
  const held = ogre({ effects: [stoned!.effect!] });

  it('three failures make it worse; fewer keep it going', () => {
    let token = held;
    for (let i = 0; i < 2; i++) token = endOfTurnSaves(token, side(token).sheet, () => 0.01).token;
    expect(token.effects?.[0]?.conditions).toEqual(['restrained']);
    token = endOfTurnSaves(token, side(token).sheet, () => 0.01).token;
    expect(token.effects?.[0]?.conditions).toEqual(['petrified']);
  });

  it('three successes end it, one does not', () => {
    let token = endOfTurnSaves(held, side(held).sheet, () => 0.99).token;
    expect(token.effects).toHaveLength(1);
    for (let i = 0; i < 2; i++) token = endOfTurnSaves(token, side(token).sheet, () => 0.99).token;
    expect(token.effects ?? []).toHaveLength(0);
  });
});
