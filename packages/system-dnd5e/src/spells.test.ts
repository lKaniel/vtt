import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { type Token, TokenSchema } from './token-schema.ts';
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

  it("casts for free without a slot left, at any level from the spell's own up to 9th", () => {
    expect(castProblem({ spell: spell('magic-missile'), slot: 4, sheet, free: true })).toBeUndefined();
    expect(castProblem({ spell: spell('magic-missile'), slot: 0, sheet, free: true })).toMatch(/slot/);
    expect(castProblem({ spell: spell('fireball'), slot: 3, sheet, free: true })).toMatch(/doesn't know/);
  });
});

describe('resolveCast', () => {
  it('lets a legendary creature turn a failed save into a success', () => {
    const dragon = TokenSchema.parse({ id: 'd', name: 'Dragon', x: 450, y: 50, monster: 'adult-black-dragon' });
    const rng = rngOf([...Array<number>(8).fill(face(3, 6)), face(1, 20)]);
    const out = resolveCast(
      { spell: spell('fireball'), slot: 3, caster: side(wizard), targets: [side(dragon)], gridSize: 100 },
      rng,
    );
    expect(out.results[0]?.save).toMatchObject({ success: true, legendary: true });
    expect(out.results[0]?.damage).toBe(12);
  });

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

  it('gives temporary hit points instead of healing (false life)', () => {
    const rng = rngOf([face(2, 4)]);
    const out = resolveCast(
      { spell: spell('false-life'), slot: 2, caster: side(wizard), targets: [side(wizard)], gridSize: 100 },
      rng,
    );
    expect(out.results[0]!.tempHp).toBe(2 + 4 + 5);
    expect(out.results[0]!.healed).toBeUndefined();
  });

  it('keeps the higher of old and new temporary hit points', () => {
    const tough = TokenSchema.parse({ ...wizard, tempHp: 30 });
    const out = resolveCast(
      { spell: spell('false-life'), slot: 1, caster: side(tough), targets: [side(tough)], gridSize: 100 },
      () => 0,
    );
    expect(out.results[0]!.tempHp).toBe(30);
  });

  it('heals the caster for half the necrotic damage (vampiric touch)', () => {
    const hurt = TokenSchema.parse({ ...wizard, hp: 10 });
    const ogre = side(TokenSchema.parse({ id: 'o', name: 'Ogre', x: 150, y: 50, monster: 'ogre' }));
    // d20 of 18 hits; 3d6 of 6, 6, 5 = 17 necrotic, the caster regains 8.
    const rng = rngOf([face(18, 20), face(6, 6), face(6, 6), face(5, 6)]);
    const out = resolveCast(
      { spell: spell('vampiric-touch'), slot: 3, caster: side(hurt), targets: [ogre], gridSize: 100 },
      rng,
    );
    expect(out.results[0]).toMatchObject({ target: 'o', damage: 17 });
    expect(out.drained).toBe(8);
  });

  it('puts the weakest creatures to sleep first, as far as the hit point pool goes (2014 sleep)', () => {
    const weak = side(TokenSchema.parse({ id: 'w', name: 'Weak', x: 450, y: 50, monster: 'goblin', hp: 3 }));
    const strong = side(TokenSchema.parse({ id: 's', name: 'Strong', x: 550, y: 50, monster: 'ogre' }));
    const mid = side(TokenSchema.parse({ id: 'm', name: 'Mid', x: 450, y: 150, monster: 'goblin' }));
    // 5d8 of 2s = 10: the 3-hp goblin and the 7-hp goblin sleep, the ogre doesn't.
    const out = resolveCast(
      { spell: spell('sleep'), slot: 1, caster: side(wizard), targets: [strong, mid, weak], gridSize: 100 },
      rngOf(Array<number>(5).fill(face(2, 8))),
    );
    const slept = out.results.filter((r) => r.effect).map((r) => r.target);
    expect(slept).toEqual(['m', 'w']);
    expect(out.results.find((r) => r.target === 'w')!.effect).toMatchObject({
      conditions: ['unconscious'],
      endsOnDamage: true,
    });
  });

  it('knocks a laughing creature prone and incapacitated (hideous laughter)', () => {
    for (const edition of ['2014', '2024'] as const) {
      const out = resolveCast(
        {
          spell: spell('hideous-laughter', edition),
          slot: 1,
          caster: side(wizard, edition),
          targets: [side(TokenSchema.parse({ id: 'g', name: 'G', x: 450, y: 50, stats: { level: 1 } }), edition)],
          gridSize: 100,
        },
        rngOf([face(1, 20)]),
      );
      expect(out.results[0]!.effect).toMatchObject({ conditions: ['prone', 'incapacitated'], saveOnDamage: true });
    }
  });

  it('puts divine favor on the caster as damage for their weapon hits, without hurting them', () => {
    const paladin = TokenSchema.parse({ ...wizard, stats: { class: 'paladin', level: 5, abilities: { cha: 16 } } });
    const out = resolveCast(
      { spell: spell('divine-favor'), slot: 1, caster: side(paladin), targets: [side(paladin)], gridSize: 100 },
      () => 0.5,
    );
    expect(out.results[0]).toMatchObject({ target: 'wiz', damage: 0 });
    expect(out.results[0]!.effect).toMatchObject({
      hitDamage: [{ dice: '1d4', type: 'radiant' }],
      concentration: true,
    });
  });

  it("marks the target with hunter's mark: extra damage only from the caster", () => {
    const out = resolveCast(
      {
        spell: spell('hunters-mark', '2024'),
        slot: 1,
        caster: side(wizard, '2024'),
        targets: [side(goblin('g'))],
        gridSize: 100,
      },
      () => 0.5,
    );
    expect(out.results[0]).toMatchObject({ damage: 0 });
    expect(out.results[0]!.effect).toMatchObject({ onlyFor: 'wiz', markDamage: [{ dice: '1d6', type: 'force' }] });
  });

  it('adds a hex to the caster’s spell attacks against the hexed creature', () => {
    const hexed = goblin('g');
    const marked = TokenSchema.parse({
      ...hexed,
      effects: [{ id: 'hex-wiz', name: 'Hex', onlyFor: 'wiz', markDamage: [{ dice: '1d6', type: 'necrotic' }] }],
    });
    // d20 of 15 hits; fire bolt 2d10 (wizard level 5) of 1s, hex 1d6 of 3.
    const rng = rngOf([face(15, 20), face(1, 10), face(1, 10), face(3, 6)]);
    const out = resolveCast(
      { spell: spell('fire-bolt'), slot: 0, caster: side(wizard), targets: [side(marked)], gridSize: 100 },
      rng,
    );
    expect(out.results[0]!.parts.map((p) => `${p.roll.total} ${p.type}`)).toEqual(['2 fire', '3 necrotic']);
  });
});
