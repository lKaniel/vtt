import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { attackModifiers, saveModifiers } from './effects.ts';
import { type Token, TokenSchema } from './token-schema.ts';
import { type Effect, SpellSchema } from './spell-schema.ts';
import { resolveCast, withChoice } from './spells.ts';

// Engine pieces spells lean on: choices, hit point tiers, dispelling, shared
// healing pools, saves only later, and effects about one creature.

const content = srdFor('2014');
const wizard = TokenSchema.parse({
  id: 'wiz',
  name: 'Wizard',
  x: 50,
  y: 50,
  ownership: { default: 'limited', ana: 'owner' },
  stats: { class: 'wizard', level: 9, abilities: { int: 18 } },
});
const ogre = (patch: Partial<Token> = {}) =>
  TokenSchema.parse({
    id: 'ogre',
    name: 'Ogre',
    x: 150,
    y: 50,
    monster: 'ogre',
    ownership: { default: 'none' },
    ...patch,
  });
const side = (token: Token) => ({ token, sheet: resolveCreature(token, content)! });
const spellOf = (fields: Record<string, unknown>) =>
  SpellSchema.parse({
    id: 'test',
    name: 'Test',
    level: 3,
    school: 'evocation',
    castingTime: 'action',
    range: 60,
    ...fields,
  });
const cast = (
  fields: Record<string, unknown>,
  targets: Token[],
  { rng = (): number => 0.5, slot = 3 }: { rng?: () => number; slot?: number } = {},
) =>
  resolveCast({ spell: spellOf(fields), slot, caster: side(wizard), targets: targets.map(side), gridSize: 100 }, rng)
    .results;

describe('choices', () => {
  const orb = spellOf({
    damage: [{ dice: '3d8', type: 'acid' }],
    save: { ability: 'dex' },
    choices: [
      { id: 'acid', name: 'Acid', set: {} },
      { id: 'fire', name: 'Fire', set: { damage: [{ dice: '3d8', type: 'fire' }], save: null } },
    ],
  });

  it('sets the chosen option’s fields over the spell’s, null taking one away', () => {
    const fire = withChoice(orb, 'fire');
    expect(fire).toMatchObject({ chosen: 'fire', damage: [{ type: 'fire' }] });
    expect(fire.save).toBeUndefined();
  });

  it('takes the first option when none is named, and refuses an unknown one', () => {
    expect(withChoice(orb, undefined).chosen).toBe('acid');
    expect(() => withChoice(orb, 'void')).toThrow(/no option/);
    expect(withChoice(spellOf({}), undefined).chosen).toBeUndefined();
  });

  it('every SRD choice is a valid spell', () => {
    for (const edition of ['2014', '2024'] as const) {
      for (const s of srdFor(edition).spells.values()) {
        for (const c of s.choices ?? []) expect(() => withChoice(s, c.id), `${s.id}/${c.id}`).not.toThrow();
      }
    }
  });
});

describe('hit point tiers', () => {
  const word = {
    targets: 1,
    hpTiers: [
      { atMost: 20, kill: true },
      { atMost: 50, effect: { conditions: ['stunned'] } },
    ],
  };

  it('kills, or applies the tier’s effect, by the target’s hit points', () => {
    expect(cast(word, [ogre({ hp: 15 })])[0]).toMatchObject({ killed: true, hp: 0 });
    expect(cast(word, [ogre({ hp: 40 })])[0]!.effect?.conditions).toEqual(['stunned']);
    expect(cast(word, [ogre({ hp: 55 })])[0]).toMatchObject({ immune: true });
  });
});

describe('saves only later', () => {
  it('rolls no save when cast, but the effect repeats one', () => {
    const [r] = cast(
      { save: { ability: 'con', onCast: false }, effect: { conditions: ['stunned'], repeatSave: true } },
      [ogre()],
    );
    expect(r!.save).toBeUndefined();
    expect(r!.effect).toMatchObject({ conditions: ['stunned'], save: { ability: 'con', dc: 16 } });
  });
});

describe('effects remember their spell', () => {
  it('records the spell and slot, and who `forCaster` effects are about', () => {
    const [r] = cast({ effect: { advantageAgainst: true, forCaster: true } }, [ogre()], { slot: 5 });
    expect(r!.effect).toMatchObject({ spell: 'test', slot: 5, onlyFor: 'wiz' });
  });
});

describe('dispelling', () => {
  const held = (slot: number): Effect => ({
    id: 'hold',
    name: 'Hold',
    spell: 'hold-person',
    slot,
    conditions: ['paralyzed'],
  });

  it('ends spells of the dispel’s level or lower outright', () => {
    expect(cast({ dispels: true }, [ogre({ effects: [held(3)] })])[0]!.cured).toEqual(['hold']);
  });

  it('needs a spellcasting check for higher ones', () => {
    const target = ogre({ effects: [held(5)] });
    expect(cast({ dispels: true }, [target], { rng: () => 0 })[0]!.cured).toBeUndefined();
    expect(cast({ dispels: true }, [target], { rng: () => 0.99 })[0]!.cured).toEqual(['hold']);
  });

  it('ends only the named spells when given a list', () => {
    const target = ogre({ effects: [held(1), { id: 'curse', name: 'Curse', spell: 'bestow-curse' }] });
    expect(cast({ dispels: ['bestow-curse'] }, [target])[0]!.cured).toEqual(['curse']);
  });
});

describe('a shared healing pool', () => {
  it('heals each target up to its maximum until the pool runs out', () => {
    const a = ogre({ id: 'a', hp: 1 });
    const b = ogre({ id: 'b', hp: 1 });
    const max = side(a).sheet.maxHp;
    const [ra, rb] = cast({ heal: `${max}`, healShared: true }, [a, b]);
    expect(ra!.healed).toBe(max - 1);
    expect(rb!.healed).toBe(1);
  });
});

describe('effect modifiers', () => {
  it('condition immunity keeps conditions off the bearer', () => {
    const free = ogre({
      effects: [
        { id: 'fom', name: 'Freedom', conditionImmunities: ['restrained'] },
        { id: 'web', name: 'Web', conditions: ['restrained', 'blinded'] },
      ],
    });
    expect(side(free).sheet.conditions).toEqual(['blinded']);
    const zombie = ogre({ monster: 'zombie', effects: [{ id: 'p', name: 'Poison', conditions: ['poisoned'] }] });
    expect(side(zombie).sheet.conditions).toEqual([]);
  });

  it('a forCaster effect on the attacker counts only against the caster', () => {
    const cursed = ogre({ effects: [{ id: 'c', name: 'Curse', disadvantage: true, onlyFor: 'wiz' }] });
    const other = { ...wizard, id: 'other' };
    expect(attackModifiers(side(cursed), side(wizard), { within5: true }).disadvantage).toBe(true);
    expect(attackModifiers(side(cursed), side(other), { within5: true }).disadvantage).toBe(false);
  });

  it('fromTypes limits disadvantage to attackers of those types', () => {
    const warded = { ...wizard, effects: [{ id: 'p', name: 'Ward', disadvantageAgainst: true, fromTypes: ['fiend'] }] };
    expect(attackModifiers(side(ogre()), side(warded), { within5: true }).disadvantage).toBe(false);
    const imp = ogre({ monster: 'imp' });
    expect(attackModifiers(side(imp), side(warded), { within5: true }).disadvantage).toBe(true);
  });

  it('saveDisadvantageFor hinders saves of those abilities only', () => {
    const cursed = side(ogre({ effects: [{ id: 'c', name: 'Curse', saveDisadvantageFor: ['wis'] }] })).sheet;
    expect(saveModifiers(cursed, 'wis').disadvantage).toBe(true);
    expect(saveModifiers(cursed, 'str').disadvantage).toBe(false);
  });
});
