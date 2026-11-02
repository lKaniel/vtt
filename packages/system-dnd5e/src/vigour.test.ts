import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { attackModifiers, rollSave } from './effects.ts';
import { rest } from './features.ts';
import { exhaustionEffect, hitDiceOf, spendHitDie } from './vigour.ts';
import { TokenSchema } from './token-schema.ts';

const fighter = (data: object = {}, rules: '2014' | '2024' = '2014') =>
  TokenSchema.parse({
    id: 'f',
    name: 'Fighter',
    x: 50,
    y: 50,
    stats: { class: 'fighter', level: 4, rules, abilities: { con: 14, dex: 10 } },
    ...data,
  });
const sheetOf = (t: ReturnType<typeof fighter>, rules: '2014' | '2024' = '2014') => resolveCreature(t, srdFor(rules))!;
const goblin = TokenSchema.parse({ id: 'g', name: 'Goblin', x: 100, y: 50, monster: 'goblin' });

describe('exhaustion under the 2014 rules', () => {
  it('builds up: checks, then speed, then attacks and saves, then hit points, then no moving', () => {
    expect(exhaustionEffect(1, '2014')).toMatchObject({ checkDisadvantage: true });
    expect(sheetOf(fighter({ exhaustion: 2 })).speed).toBe(15);
    const three = sheetOf(fighter({ exhaustion: 3 }));
    const target = { token: goblin, sheet: sheetOf(goblin) };
    expect(attackModifiers({ token: fighter(), sheet: three }, target, { within5: true }).disadvantage).toBe(true);
    expect(rollSave(three, 'con', 10, () => 0.99).roll?.formula).toMatch(/^2d20kl1/);
    const full = sheetOf(fighter()).maxHp;
    expect(sheetOf(fighter({ exhaustion: 4 })).maxHp).toBe(Math.floor(full / 2));
    expect(sheetOf(fighter({ exhaustion: 5 })).speed).toBe(0);
    expect(sheetOf(fighter({ exhaustion: 6 })).conditions).toContain('unconscious');
  });
});

describe('exhaustion under the 2024 rules', () => {
  it('takes 2 per level from d20 tests and 5 ft per level from speed', () => {
    const tired = sheetOf(fighter({ exhaustion: 2 }, '2024'), '2024');
    expect(tired.speed).toBe(20);
    expect(rollSave(tired, 'con', 10, () => 0.5).roll?.formula).toBe('1d20+4-4');
    expect(exhaustionEffect(2, '2024')).toMatchObject({ attackBonus: '-4', checkBonus: '-4' });
  });

  it('goes down one level with a long rest', () => {
    const t = fighter({ exhaustion: 2 }, '2024');
    expect(rest(t, sheetOf(t, '2024'), 'long').exhaustion).toBe(1);
    const one = fighter({ exhaustion: 1 });
    expect(rest(one, sheetOf(one), 'long').exhaustion).toBeUndefined();
    expect(rest(t, sheetOf(t, '2024'), 'short').exhaustion).toBe(2);
  });
});

describe('hit dice', () => {
  it('are one per level, of the class die', () => {
    const t = fighter({ spent: { hitDice: 1 } });
    expect(hitDiceOf(t, sheetOf(t))).toEqual({ die: 10, total: 4, left: 3 });
    expect(hitDiceOf(goblin, sheetOf(goblin))).toBeUndefined();
  });

  it('heal the die plus Con when spent, never below 0', () => {
    const t = fighter({ hp: 10 });
    const spent = spendHitDie(t, sheetOf(t), () => 0.5);
    expect(spent.healed).toBe(6 + 2);
    expect(spent.token.hp).toBe(18);
    expect(spent.token.spent?.hitDice).toBe(1);
  });

  it('come back on a long rest: half (2014) or all (2024)', () => {
    const t = fighter({ spent: { hitDice: 4 } });
    expect(rest(t, sheetOf(t), 'long').spent?.hitDice).toBe(2);
    const t24 = fighter({ spent: { hitDice: 4 } }, '2024');
    expect(rest(t24, sheetOf(t24, '2024'), 'long').spent).toBeUndefined();
  });
});
