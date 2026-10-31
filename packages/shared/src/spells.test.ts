import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { TokenSchema, type Token } from './schema.ts';
import { castProblem, resolveCast, scaledSpell } from './spells.ts';
import type { Edition } from './stats-schema.ts';

const spell = (id: string, edition: Edition = '2014') => srdFor(edition).spells.get(id)!;
const wizard = TokenSchema.parse({
  id: 'wiz',
  name: 'Wiz',
  x: 50,
  y: 50,
  stats: { class: 'wizard', level: 5, abilities: { int: 18, dex: 14 }, spells: ['fire-bolt', 'magic-missile'] },
});
const goblin = (id: string, x = 450) => TokenSchema.parse({ id, name: id, x, y: 50, monster: 'goblin' });
const side = (token: Token, edition: Edition = '2014') => ({ token, sheet: resolveCreature(token, srdFor(edition))! });
/** A die roll as the rng value that rolls `face` on a die with `sides` sides. */
const face = (n: number, sides: number) => (n - 1) / sides + 0.001;
const rngOf = (values: number[]) => () => values.shift() ?? 0.5;

describe('scaledSpell', () => {
  it('adds damage dice per slot level above the spell', () => {
    expect(scaledSpell(spell('fireball'), 5, 5).damage).toEqual([{ dice: '10d6', type: 'fire' }]);
  });

  it('grows cantrips with the caster’s level', () => {
    expect(scaledSpell(spell('fire-bolt'), 0, 4).damage[0]!.dice).toBe('1d10');
    expect(scaledSpell(spell('fire-bolt'), 0, 5).damage[0]!.dice).toBe('2d10');
    expect(scaledSpell(spell('fire-bolt'), 0, 17).damage[0]!.dice).toBe('4d10');
    expect(scaledSpell(spell('eldritch-blast'), 0, 11).beams).toBe(3);
  });

  it('adds darts, targets and healing for higher slots', () => {
    expect(scaledSpell(spell('magic-missile'), 3, 5).beams).toBe(5);
    expect(scaledSpell(spell('hold-person'), 4, 7).targets).toBe(3);
    expect(scaledSpell(spell('cure-wounds', '2024'), 2, 3).heal).toBe('4d8');
  });
});

describe('castProblem', () => {
  const sheet = side(wizard).sheet;

  it('needs a known spell and a free slot of high enough level', () => {
    expect(castProblem({ spell: spell('fireball'), slot: 3, sheet })).toMatch(/doesn't know/);
    expect(castProblem({ spell: spell('magic-missile'), slot: 0, sheet })).toMatch(/slot/);
    expect(castProblem({ spell: spell('magic-missile'), slot: 4, sheet })).toMatch(/no 4th-level slots/);
    expect(castProblem({ spell: spell('magic-missile'), slot: 1, sheet })).toBeUndefined();
    expect(castProblem({ spell: spell('fire-bolt'), slot: 0, sheet })).toBeUndefined();
  });
});

describe('resolveCast', () => {
  it('rolls a spell attack and damage on a hit', () => {
    // d20 of 15 + 7 hits AC 15; 2d10 roll 4 and 6.
    const rng = rngOf([face(15, 20), face(4, 10), face(6, 10)]);
    const out = resolveCast(
      { spell: spell('fire-bolt'), slot: 0, caster: side(wizard), targets: [side(goblin('g'))], gridSize: 100 },
      rng,
    );
    expect(out.results[0]).toMatchObject({ target: 'g', hit: true, damage: 10, hp: 0 });
    expect(out.results[0]!.attack?.total).toBe(22);
  });

  it('halves damage on a successful save for everyone in the area', () => {
    const targets = [side(goblin('a')), side(goblin('b', 550))];
    // One 8d6 roll for everyone, all 3s = 24. Goblin a fails (d20 1), goblin b saves (d20 20).
    const rng = rngOf([...Array<number>(8).fill(face(3, 6)), face(1, 20), face(20, 20)]);
    const out = resolveCast({ spell: spell('fireball'), slot: 3, caster: side(wizard), targets, gridSize: 100 }, rng);
    expect(out.results.map((r) => [r.target, r.save?.success, r.damage])).toEqual([
      ['a', false, 24],
      ['b', true, 12],
    ]);
  });

  it('pushes creatures that fail the save, and only those (thunderwave)', () => {
    const targets = [side(goblin('a', 150)), side(goblin('b', 150))];
    // 2d8 of 1s; goblin a fails (d20 1), goblin b saves (d20 20).
    const rng = rngOf([face(1, 8), face(1, 8), face(1, 20), face(20, 20)]);
    const out = resolveCast(
      { spell: spell('thunderwave'), slot: 1, caster: side(wizard), targets, gridSize: 100 },
      rng,
    );
    expect(out.results.map((r) => r.push)).toEqual([10, undefined]);
  });

  it('sends each magic missile dart on its own and never misses', () => {
    const g = side(goblin('g'));
    const rng = rngOf([face(1, 4), face(1, 4), face(1, 4)]);
    const out = resolveCast(
      { spell: spell('magic-missile'), slot: 1, caster: side(wizard), targets: [g, g, g], gridSize: 100 },
      rng,
    );
    expect(out.results.map((r) => r.damage)).toEqual([2, 2, 2]);
    expect(out.results.at(-1)!.hp).toBe(1);
  });

  it('heals with the spellcasting modifier', () => {
    const cleric = TokenSchema.parse({
      ...wizard,
      stats: { class: 'cleric', level: 1, maxHp: 20, abilities: { wis: 16 } },
      hp: 1,
    });
    const rng = rngOf([face(5, 8)]);
    const out = resolveCast(
      { spell: spell('cure-wounds'), slot: 1, caster: side(cleric), targets: [side(cleric)], gridSize: 100 },
      rng,
    );
    expect(out.results[0]).toMatchObject({ healed: 8 });
  });

  it('puts the spell’s effect on creatures that fail the save, tied to concentration', () => {
    const bandit = side(TokenSchema.parse({ id: 'b', name: 'Bandit', x: 450, y: 50, monster: 'bandit' }));
    const out = resolveCast(
      { spell: spell('hold-person'), slot: 2, caster: side(wizard), targets: [bandit], gridSize: 100 },
      rngOf([face(1, 20)]),
    );
    expect(out.results[0]!.effect).toMatchObject({
      id: 'hold-person-wiz',
      name: 'Hold Person',
      conditions: ['paralyzed'],
      source: 'wiz',
      concentration: true,
      rounds: 10,
      save: { ability: 'wis', dc: 15 },
    });
  });

  it('leaves creatures of the wrong type alone', () => {
    const wolf = side(TokenSchema.parse({ id: 'w', name: 'Wolf', x: 450, y: 50, monster: 'wolf' }));
    const out = resolveCast(
      { spell: spell('hold-person'), slot: 2, caster: side(wizard), targets: [wolf], gridSize: 100 },
      () => 0,
    );
    expect(out.results[0]).toMatchObject({ immune: true });
    expect(out.results[0]!.effect).toBeUndefined();
  });
});
