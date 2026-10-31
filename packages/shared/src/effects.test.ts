import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import {
  attackModifiers,
  canAct,
  concentrationDc,
  afterDamage,
  dropConcentration,
  rollSave,
  saveModifiers,
  tickEffects,
} from './effects.ts';
import { TokenSchema, type Token } from './schema.ts';
import type { Effect } from './spell-schema.ts';

const token = (id: string, data: object = {}) =>
  TokenSchema.parse({ id, name: id, x: 50, y: 50, stats: { level: 1, abilities: { dex: 14 } }, ...data });
const sheet = (t: Token) => resolveCreature(t, srdFor('2014'))!;
const effect = (data: Partial<Effect>): Effect => ({ id: 'e', name: 'E', ...data });
const withEffects = (id: string, ...effects: Partial<Effect>[]) =>
  token(id, { effects: effects.map((e, i) => effect({ id: `e${i}`, ...e })) });

describe('conditions on attack rolls', () => {
  const attack = (a: Token, t: Token, within5 = true) =>
    attackModifiers({ token: a, sheet: sheet(a) }, { token: t, sheet: sheet(t) }, { within5 });

  it('gives advantage against the blinded, restrained, stunned or paralyzed', () => {
    for (const c of ['blinded', 'restrained', 'stunned', 'paralyzed'] as const) {
      expect(attack(token('a'), withEffects('t', { conditions: [c] })).advantage).toBe(true);
    }
  });

  it('gives disadvantage to attackers that are poisoned, blinded, prone or frightened', () => {
    for (const c of ['poisoned', 'blinded', 'prone', 'frightened'] as const) {
      expect(attack(withEffects('a', { conditions: [c] }), token('t')).disadvantage).toBe(true);
    }
  });

  it('helps melee and hinders ranged attacks against a prone target', () => {
    const prone = withEffects('t', { conditions: ['prone'] });
    expect(attack(token('a'), prone, true)).toMatchObject({ advantage: true, disadvantage: false });
    expect(attack(token('a'), prone, false)).toMatchObject({ advantage: false, disadvantage: true });
  });

  it('crits automatically on a paralyzed target within 5 ft', () => {
    const held = withEffects('t', { conditions: ['paralyzed'] });
    expect(attack(token('a'), held, true).autoCrit).toBe(true);
    expect(attack(token('a'), held, false).autoCrit).toBe(false);
  });

  it('adds bless dice and uses up one-shot effects', () => {
    const blessed = withEffects('a', { attackBonus: '1d4' }, { disadvantage: true, once: true });
    const marked = withEffects('t', { advantageAgainst: true, once: true });
    const mods = attack(blessed, marked);
    expect(mods).toMatchObject({ bonus: ['1d4'], advantage: true, disadvantage: true });
    expect(mods.used).toEqual([
      { token: 'a', effect: 'e1' },
      { token: 't', effect: 'e0' },
    ]);
  });

  it('only gives vexing advantage to the creature that vexed', () => {
    const vexed = withEffects('t', { advantageAgainst: true, once: true, onlyFor: 'b' });
    expect(attack(token('a'), vexed).advantage).toBe(false);
    expect(attack(token('b'), vexed).advantage).toBe(true);
  });

  it('ends invisibility when the invisible creature attacks', () => {
    const hidden = withEffects('a', { conditions: ['invisible'], endsOnAttack: true });
    expect(attack(hidden, token('t'))).toMatchObject({ advantage: true, used: [{ token: 'a', effect: 'e0' }] });
  });
});

describe('saving throws', () => {
  it('fails strength and dexterity saves automatically while paralyzed', () => {
    const held = sheet(withEffects('t', { conditions: ['paralyzed'] }));
    expect(saveModifiers(held, 'dex').autoFail).toBe(true);
    expect(saveModifiers(held, 'wis').autoFail).toBe(false);
    expect(rollSave(held, 'dex', 5, () => 0.99).success).toBe(false);
  });

  it('adds the ability modifier and bless, and succeeds at the DC', () => {
    const blessed = sheet(withEffects('t', { saveBonus: '1d4' }));
    // d20 of 10, +2 dex, +2 on the d4.
    const save = rollSave(blessed, 'dex', 14, () => 0.451);
    expect(save).toMatchObject({ total: 14, success: true });
  });

  it('rolls twice and keeps the higher with advantage', () => {
    const raging = sheet(withEffects('t', { saveAdvantage: ['str'] }));
    const rolls = [0.05, 0.95];
    expect(rollSave(raging, 'str', 15, () => rolls.shift()!).total).toBe(20);
  });
});

describe('turns and concentration', () => {
  it('stops creatures that are stunned or paralyzed from acting', () => {
    expect(canAct(sheet(withEffects('t', { conditions: ['stunned'] })))).toBe(false);
    expect(canAct(sheet(withEffects('t', { conditions: ['prone'] })))).toBe(true);
  });

  it('counts down effects on the turns of the creature that made them', () => {
    const t = withEffects('t', { source: 'caster', rounds: 2 }, { source: 'other', rounds: 1 });
    const after = tickEffects(t, 'caster');
    expect(after.effects?.map((e) => e.rounds)).toEqual([1, 1]);
    expect(tickEffects(after, 'caster').effects?.map((e) => e.id)).toEqual(['e1']);
  });

  it('needs a Con save of half the damage, at least 10 (at most 30 in 2024)', () => {
    expect(concentrationDc(7, '2014')).toBe(10);
    expect(concentrationDc(31, '2014')).toBe(15);
    expect(concentrationDc(100, '2024')).toBe(30);
    expect(concentrationDc(100, '2014')).toBe(50);
  });

  it('ends every effect and summon of the spell when concentration drops', () => {
    const caster = token('caster', { concentration: { spell: 'bless', name: 'Bless' } });
    const ally = withEffects('ally', { source: 'caster', concentration: true }, { source: 'caster' });
    const wolf = token('wolf', { summon: { by: 'caster', spell: 'conjure-animals', concentration: true } });
    const owl = token('owl', { summon: { by: 'caster', spell: 'find-familiar' } });
    const out = dropConcentration([caster, ally, wolf, owl], 'caster');
    expect(out.removed).toEqual(['wolf']);
    expect(out.changed.map((t) => t.id)).toEqual(['caster', 'ally']);
    expect(out.changed[0]!.concentration).toBeUndefined();
    expect(out.changed[1]!.effects?.map((e) => e.id)).toEqual(['e1']);
  });
});

describe('effects that taking damage ends', () => {
  it('wakes a sleeper and snaps a creature out of a hypnotic pattern', () => {
    const t = withEffects('t', { name: 'Sleep', endsOnDamage: true, conditions: ['unconscious'] }, { name: 'Bless' });
    const out = afterDamage(t, sheet(t), () => 0);
    expect(out.token.effects?.map((e) => e.name)).toEqual(['Bless']);
    expect(out.notes).toEqual(['t wakes from Sleep']);
  });

  it('gives a new save, with advantage, against effects like hideous laughter', () => {
    const laughing = { name: 'Laughter', saveOnDamage: true, save: { ability: 'wis' as const, dc: 15 } };
    const t = withEffects('t', laughing);
    // Advantage: the better of 3 and 19 saves.
    const rolls = [(3 - 1) / 20, (19 - 1) / 20];
    const out = afterDamage(t, sheet(t), () => rolls.shift() ?? 0);
    expect(out.token.effects).toBeUndefined();
    expect(out.notes[0]).toMatch(/shakes off Laughter/);
  });
});
