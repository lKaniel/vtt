import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { auraEffects } from './auras.ts';
import { lastingEffects } from './zones.ts';
import { barrierStops } from './barriers.ts';
import { type Token, TokenSchema } from './token-schema.ts';
import { castProblem, resolveCast } from './spells.ts';
import type { Effect } from './spell-schema.ts';
import type { Edition } from './stats-schema.ts';

// Spells whose area changes what happens inside it while it lasts: silence,
// antimagic field, globe of invulnerability and aura of life. The area is an
// aura on its caster, anchored where it was cast or around the caster.

const book = (edition: Edition) => srdFor(edition);
const spell = (id: string, edition: Edition = '2014') => book(edition).spells.get(id)!;
const caster = (patch: Partial<Token> = {}) =>
  TokenSchema.parse({
    id: 'wiz',
    name: 'Wizard',
    x: 50,
    y: 50,
    ownership: { default: 'limited', ana: 'owner' },
    stats: {
      class: 'wizard',
      level: 17,
      abilities: { int: 20 },
      spells: ['fire-bolt', 'magic-missile', 'shield', 'fireball', 'silence', 'antimagic-field'],
    },
    ...patch,
  });
const ogre = (patch: Partial<Token> = {}) =>
  TokenSchema.parse({
    id: 'ogre',
    name: 'Ogre',
    x: 450,
    y: 50,
    monster: 'ogre',
    ownership: { default: 'none' },
    ...patch,
  });
const side = (token: Token, edition: Edition = '2014') => ({ token, sheet: resolveCreature(token, book(edition))! });

/** The aura copies each token gets with `bearer` keeping `effects` up. */
function inside(bearer: Token, effects: Effect[], others: Token[], edition: Edition = '2014') {
  const keeping = { ...bearer, effects };
  return auraEffects(
    [keeping, ...others].map((t) => side(t, edition)),
    { gridSize: 100 },
  );
}

describe('silence', () => {
  const lasting = lastingEffects(caster(), spell('silence'), 2, [500, 50]);

  it('deafens creatures within 20 ft of the point and makes them immune to thunder', () => {
    const copies = inside(caster(), lasting, [ogre(), ogre({ id: 'far', x: 950 })]);
    expect(copies.get('wiz')).toBeUndefined();
    expect(copies.get('far')).toBeUndefined();
    const hushed = side(ogre({ effects: copies.get('ogre') }));
    expect(hushed.sheet.conditions).toContain('deafened');
    expect(hushed.sheet.immunities).toContain('thunder');
  });

  it('stops spells with a verbal component inside it, but not the others', () => {
    const hushed = caster({ x: 500 });
    const all = inside(hushed, lasting, []);
    const sheet = side({ ...hushed, effects: [...lasting, ...(all.get('wiz') ?? [])] }).sheet;
    expect(castProblem({ spell: spell('fire-bolt'), slot: 0, sheet })).toMatch(/Silence/);
    expect(castProblem({ spell: spell('shield'), slot: 1, sheet })).toMatch(/Silence/);
    const quiet = { ...spell('fire-bolt'), components: ['s' as const] };
    expect(castProblem({ spell: { ...quiet, id: 'fire-bolt' }, slot: 0, sheet })).toBeUndefined();
  });
});

describe('antimagic field', () => {
  const lasting = lastingEffects(caster(), spell('antimagic-field'), 8);
  const copies = inside(caster(), lasting, [ogre({ x: 150 })]);

  it('suppresses spell effects on creatures inside it', () => {
    const blessed: Effect = { id: 'bless', name: 'Bless', attackBonus: '1d4', spell: 'bless', slot: 1, source: 'x' };
    const sheet = side(ogre({ x: 150, effects: [blessed, ...copies.get('ogre')!] })).sheet;
    expect(sheet.effects.some((e) => e.id === 'bless')).toBe(false);
    expect(sheet.effects.some((e) => e.antimagic)).toBe(true);
  });

  it('stops spells cast inside it and spells that reach into it', () => {
    const wiz = side({ ...caster(), effects: [...lasting, ...copies.get('wiz')!] }).sheet;
    expect(castProblem({ spell: spell('magic-missile'), slot: 1, sheet: wiz })).toMatch(/antimagic/i);
    const outside = caster({ id: 'other', x: 950 });
    const [r] = resolveCast({
      spell: spell('magic-missile'),
      slot: 1,
      caster: side(outside),
      targets: [side(ogre({ x: 150, effects: copies.get('ogre') }))],
      gridSize: 100,
    }).results;
    expect(r).toMatchObject({ immune: true, damage: 0 });
  });
});

describe('globe of invulnerability', () => {
  const lasting = lastingEffects(caster(), spell('globe-of-invulnerability'), 6);
  const copies = inside(caster(), lasting, [ogre({ x: 950 })]);
  const warded = side({ ...caster(), effects: [...lasting, ...copies.get('wiz')!] });
  const shoot = (slot: number, from: Token) =>
    resolveCast({ spell: spell('fireball'), slot, caster: side(from), targets: [warded], gridSize: 100 }, () => 0.5)
      .results[0]!;

  it('stops spells of 5th level or lower cast from outside', () => {
    expect(shoot(5, ogre({ id: 'mage', x: 950, monster: 'mage' }))).toMatchObject({ immune: true, damage: 0 });
    expect(shoot(6, ogre({ id: 'mage', x: 950, monster: 'mage' })).damage).toBeGreaterThan(0);
  });

  it('lets spells from inside through', () => {
    const friend = caster({
      id: 'friend',
      x: 150,
      effects: inside(caster(), lasting, [caster({ id: 'friend', x: 150 })]).get('friend'),
    });
    expect(shoot(3, friend).damage).toBeGreaterThan(0);
  });
});

describe('aura of life', () => {
  it('2024: allies within 30 ft resist necrotic and rise from 0 hit points', () => {
    const lasting = lastingEffects(caster(), spell('aura-of-life', '2024'), 4);
    const ally = caster({ id: 'ally', x: 250, ownership: { default: 'limited', bo: 'owner' } });
    const copies = inside(caster(), lasting, [ally, ogre({ x: 250, monster: 'ogre' })], '2024');
    expect(copies.get('ogre')).toBeUndefined();
    const sheet = side({ ...ally, effects: copies.get('ally') }, '2024').sheet;
    expect(sheet.resistances).toContain('necrotic');
    expect(sheet.effects.some((e) => e.lifeline)).toBe(true);
  });
});

describe('antilife shell', () => {
  const [shell] = resolveCast({
    spell: spell('antilife-shell'),
    slot: 5,
    caster: side(caster()),
    targets: [side(caster())],
    gridSize: 100,
  }).results;
  const bearer = caster({ effects: [shell!.effect!] });

  it('keeps living creatures from walking into it', () => {
    const path: [number, number][] = [
      [450, 50],
      [250, 50],
      [150, 50],
    ];
    expect(barrierStops({ mover: ogre(), type: 'giant', path, others: [bearer], gridSize: 100 })).toBe(bearer);
    expect(barrierStops({ mover: ogre(), type: 'undead', path, others: [bearer], gridSize: 100 })).toBeUndefined();
    const short: [number, number][] = [
      [450, 50],
      [350, 50],
    ];
    expect(
      barrierStops({ mover: ogre(), type: 'giant', path: short, others: [bearer], gridSize: 100 }),
    ).toBeUndefined();
  });
});
