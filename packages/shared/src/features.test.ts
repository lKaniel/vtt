import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { endOfTurnSaves, featureProblem, rest, useFeature } from './features.ts';
import { TokenSchema, type Token } from './schema.ts';
import type { Edition } from './stats-schema.ts';

const character = (cls: string, rules: Edition, data: object = {}) =>
  TokenSchema.parse({
    id: 'pc',
    name: 'PC',
    x: 50,
    y: 50,
    stats: { class: cls, level: 3, rules, maxHp: 30, abilities: { str: 16, con: 14 } },
    ...data,
  });
const sheet = (t: Token) => resolveCreature(t, srdFor(t.stats?.rules ?? '2014'))!;
const feature = (t: Token, id: string) => sheet(t).features.find((f) => f.id === id)!;

describe('class features follow the character’s own edition', () => {
  it('gives a 2014 fighter one second wind and a 2024 fighter two', () => {
    expect(feature(character('fighter', '2014'), 'second-wind')).toMatchObject({ max: 1, left: 1 });
    expect(feature(character('fighter', '2024'), 'second-wind')).toMatchObject({ max: 2, left: 2 });
  });

  it('heals with second wind and spends a use', () => {
    const hurt = character('fighter', '2014', { hp: 10 });
    const out = useFeature(hurt, sheet(hurt), 'second-wind', () => 0.45);
    expect(out.healed).toBe(5 + 3);
    expect(out.token.hp).toBe(18);
    expect(featureProblem(sheet(out.token), 'second-wind')).toMatch(/no uses left/);
  });

  it('gives back the action with action surge', () => {
    const f = character('fighter', '2014');
    expect(useFeature(f, sheet(f), 'action-surge').grantAction).toBe(true);
  });

  it('rages: resistance and bonus melee damage by level', () => {
    const b = character('barbarian', '2014');
    const out = useFeature(b, sheet(b), 'rage');
    expect(out.effect).toMatchObject({ name: 'Rage', meleeDamage: 2, rounds: 10, source: 'pc' });
    expect(sheet(out.token).resistances).toEqual(['bludgeoning', 'piercing', 'slashing']);
  });

  it('refuses features the character doesn’t have or that are passive', () => {
    const f = character('fighter', '2014', { stats: { class: 'fighter', level: 1 } });
    expect(featureProblem(sheet(f), 'action-surge')).toMatch(/doesn't have/);
    expect(featureProblem(sheet(character('fighter', '2014')), 'extra-attack')).toMatch(/doesn't have/);
  });
});

describe('rests', () => {
  it('gives a 2024 fighter one second wind back on a short rest, all on a long rest', () => {
    const tired = character('fighter', '2024', { hp: 5, spent: { uses: { 'second-wind': 2, 'action-surge': 1 } } });
    const short = rest(tired, sheet(tired), 'short');
    expect(short.spent?.uses).toEqual({ 'second-wind': 1 });
    expect(short.hp).toBe(5);
    const long = rest(tired, sheet(tired), 'long');
    expect(long.spent).toBeUndefined();
    expect(long.hp).toBeUndefined();
  });

  it('gives warlocks their pact slots back on a short rest, others only on a long rest', () => {
    const warlock = character('warlock', '2014', { spent: { slots: [0, 2] } });
    expect(rest(warlock, sheet(warlock), 'short').spent).toBeUndefined();
    const wizard = character('wizard', '2014', { spent: { slots: [2] } });
    expect(rest(wizard, sheet(wizard), 'short').spent?.slots).toEqual([2]);
  });

  it('ends spell effects and concentration on a long rest', () => {
    const t = character('wizard', '2014', {
      effects: [{ id: 'bless-x', name: 'Bless', attackBonus: '1d4' }],
      concentration: { spell: 'bless', name: 'Bless' },
    });
    const after = rest(t, sheet(t), 'long');
    expect(after.effects).toBeUndefined();
    expect(after.concentration).toBeUndefined();
  });
});

describe('end of turn saves', () => {
  it('lets a held creature shake off hold person with a successful save', () => {
    const held = character('fighter', '2014', {
      effects: [
        {
          id: 'hp',
          name: 'Hold Person',
          conditions: ['paralyzed'],
          repeatSave: true,
          save: { ability: 'wis', dc: 12 },
        },
      ],
    });
    expect(endOfTurnSaves(held, sheet(held), () => 0.1).token.effects).toHaveLength(1);
    const freed = endOfTurnSaves(held, sheet(held), () => 0.99);
    expect(freed.token.effects).toBeUndefined();
    expect(freed.saves[0]).toMatchObject({ effect: 'Hold Person', save: { success: true } });
  });
});
