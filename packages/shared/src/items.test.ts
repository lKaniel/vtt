import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { itemCost, itemProblem, useItem } from './items.ts';
import { TokenSchema, type Token } from './schema.ts';
import type { Edition } from './stats-schema.ts';

const pc = (rules: Edition, data: object = {}) =>
  TokenSchema.parse({
    id: 'pc',
    name: 'PC',
    x: 50,
    y: 50,
    hp: 5,
    stats: { rules, level: 3, maxHp: 30 },
    inventory: [
      { item: 'longsword', equipped: true },
      { item: 'potion-of-healing', qty: 2 },
    ],
    ...data,
  });
const sheet = (t: Token) => resolveCreature(t, srdFor(t.stats?.rules ?? '2014'))!;
const potion = srdFor('2014').items.get('potion-of-healing')!;

describe('using items', () => {
  it('drinks a potion of healing: 2d4+2 back and one fewer potion', () => {
    const t = pc('2014');
    const out = useItem(t, sheet(t), 'potion-of-healing', () => 0.999);
    expect(out.healed).toBe(10);
    expect(out.token.hp).toBe(15);
    expect(out.token.inventory?.[1]).toMatchObject({ item: 'potion-of-healing', qty: 1 });
  });

  it('drops the last potion from the inventory once drunk', () => {
    const t = pc('2014', { inventory: [{ item: 'potion-of-healing' }] });
    expect(useItem(t, sheet(t), 'potion-of-healing', () => 0).token.inventory).toEqual([]);
  });

  it('takes an action in 2014 and a bonus action in 2024', () => {
    expect(itemCost(potion, '2014')).toBe('action');
    expect(itemCost(potion, '2024')).toBe('bonus');
  });

  it('refuses items that are not carried or do nothing when used', () => {
    const t = pc('2014');
    expect(itemProblem(t, srdFor('2014').items.get('rope'))).toMatch(/doesn't carry/);
    expect(itemProblem(t, srdFor('2014').items.get('longsword'))).toMatch(/can't be used/);
    expect(itemProblem(t, potion)).toBeUndefined();
  });
});
