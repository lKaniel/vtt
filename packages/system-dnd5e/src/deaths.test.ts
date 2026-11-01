import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { damagedWhileDown, deathSave, isDying } from './deaths.ts';
import { type Token, TokenSchema } from './token-schema.ts';

const pc = (data: object = {}) =>
  TokenSchema.parse({ id: 'pc', name: 'PC', x: 50, y: 50, hp: 0, stats: { level: 3, maxHp: 20 }, ...data });
const goblin = TokenSchema.parse({ id: 'g', name: 'G', x: 0, y: 0, monster: 'goblin', hp: 0 });
const sheet = (t: Token) => resolveCreature(t, srdFor('2014'))!;
const d20 = (n: number) => () => (n - 1) / 20 + 0.001;

describe('dying', () => {
  it('leaves characters at 0 hp dying and unconscious; monsters just die', () => {
    expect(isDying(pc())).toBe(true);
    expect(sheet(pc()).conditions).toEqual(expect.arrayContaining(['unconscious', 'prone']));
    expect(isDying(goblin)).toBe(false);
    expect(isDying(pc({ hp: 3 }))).toBe(false);
    expect(isDying(pc({ deathSaves: { successes: 0, failures: 3 } }))).toBe(false);
  });

  it('counts successes on 10 or more and failures below, and stabilizes at three successes', () => {
    let t = pc({ deathSaves: { successes: 2, failures: 1 } });
    const out = deathSave(t, d20(12));
    t = out.token;
    expect(t.deathSaves).toMatchObject({ successes: 3, failures: 1, stable: true });
    expect(out.note).toMatch(/stable/);
    expect(deathSave(pc(), d20(9)).token.deathSaves).toMatchObject({ successes: 0, failures: 1 });
  });

  it('fails twice on a 1, dies at three failures, and wakes with 1 hp on a 20', () => {
    const dead = deathSave(pc({ deathSaves: { successes: 0, failures: 1 } }), d20(1));
    expect(dead.token.deathSaves).toMatchObject({ failures: 3, dead: true });
    expect(dead.note).toMatch(/dies/);
    const up = deathSave(pc({ deathSaves: { successes: 1, failures: 2 } }), d20(20));
    expect(up.token.hp).toBe(1);
    expect(up.token.deathSaves).toBeUndefined();
  });

  it('adds a failure when hurt while down, two on a critical hit, and kills outright on massive damage', () => {
    expect(damagedWhileDown(pc(), { damage: 3, crit: false, maxHp: 20, hpBefore: 0 }).deathSaves).toMatchObject({
      failures: 1,
    });
    expect(damagedWhileDown(pc(), { damage: 3, crit: true, maxHp: 20, hpBefore: 0 }).deathSaves).toMatchObject({
      failures: 2,
    });
    expect(damagedWhileDown(pc(), { damage: 26, crit: false, maxHp: 20, hpBefore: 5 }).deathSaves).toMatchObject({
      dead: true,
    });
    expect(damagedWhileDown(pc(), { damage: 7, crit: false, maxHp: 20, hpBefore: 5 }).deathSaves).toBeUndefined();
  });
});
