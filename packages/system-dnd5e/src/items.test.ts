import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { itemCost, itemProblem, useItem } from './items.ts';
import { type Token, TokenSchema } from './token-schema.ts';
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
const srd = srdFor('2014').items;
const item = (id: string) => srd.get(id)!;
const potion = item('potion-of-healing');

describe('using items', () => {
  it('drinks a potion of healing: 2d4+2 back and one fewer potion', () => {
    const t = pc('2014');
    const out = useItem(t, sheet(t), potion, () => 0.999);
    expect(out.healed).toBe(10);
    expect(out.token.hp).toBe(15);
    expect(out.token.inventory?.[1]).toMatchObject({ item: 'potion-of-healing', qty: 1 });
  });

  it('drops the last potion from the inventory once drunk', () => {
    const t = pc('2014', { inventory: [{ item: 'potion-of-healing' }] });
    expect(useItem(t, sheet(t), potion, () => 0).token.inventory).toEqual([]);
  });

  it('takes an action in 2014 and a bonus action in 2024', () => {
    expect(itemCost(potion, '2014')).toBe('action');
    expect(itemCost(potion, '2024')).toBe('bonus');
  });

  it('refuses items that are not carried or do nothing when used', () => {
    const t = pc('2014');
    expect(itemProblem(t, srdFor('2014').items.get('rope'), srd)).toMatch(/doesn't carry/);
    expect(itemProblem(t, srdFor('2014').items.get('longsword'), srd)).toMatch(/can't be used/);
    expect(itemProblem(t, potion, srd)).toBeUndefined();
  });
});

describe('items from packs and homebrew', () => {
  const tonic = { ...potion, id: 'troll-tonic', name: 'Troll Tonic' };

  it('drinks a potion the SRD does not have, as the game content gives it', () => {
    const t = pc('2014', { inventory: [{ item: 'troll-tonic' }] });
    const out = useItem(t, sheet(t), tonic, () => 0.999);
    expect(out.healed).toBe(10);
    expect(out.token.inventory).toEqual([]);
  });

  it('names missing fuel from the game content', () => {
    const lamp = { ...srdFor('2014').items.get('lantern-hooded')!, id: 'dwarf-lamp', name: 'Dwarf Lamp' };
    const fuel = lamp.type === 'gear' && lamp.use ? { ...lamp, use: { ...lamp.use, fuel: 'deep-oil' } } : lamp;
    const t = pc('2014', { inventory: [{ item: 'dwarf-lamp' }] });
    const items = new Map([['deep-oil', { ...potion, id: 'deep-oil', name: 'Deep Oil' }]]);
    expect(itemProblem(t, fuel, items)).toBe('has no Deep Oil for the Dwarf Lamp');
  });
});

describe('lighting what you carry', () => {
  it('lights a torch: one fewer torch, and the token sheds its light for an hour', () => {
    const t = pc('2014', { inventory: [{ item: 'torch', qty: 3 }] });
    const out = useItem(t, sheet(t), item('torch'));
    expect(out.token.inventory).toEqual([expect.objectContaining({ item: 'torch', qty: 2 })]);
    expect(out.token.light).toMatchObject({ name: 'Torch', bright: 20, dim: 20, lasts: 3600 });
    expect(out.lit).toBe('Torch');
  });

  it('fills a lantern from a flask of oil and keeps the lantern', () => {
    const t = pc('2014', { inventory: [{ item: 'lantern-hooded' }, { item: 'oil-flask', qty: 2 }] });
    expect(itemProblem(t, srdFor('2014').items.get('lantern-hooded'), srd)).toBeUndefined();
    const out = useItem(t, sheet(t), item('lantern-hooded'));
    expect(out.token.inventory).toEqual([
      expect.objectContaining({ item: 'lantern-hooded', qty: 1 }),
      expect.objectContaining({ item: 'oil-flask', qty: 1 }),
    ]);
    expect(out.token.light).toMatchObject({ bright: 30, dim: 30, lasts: 6 * 3600 });
  });

  it("won't light a lantern without oil", () => {
    const t = pc('2014', { inventory: [{ item: 'lantern-hooded' }] });
    expect(itemProblem(t, srdFor('2014').items.get('lantern-hooded'), srd)).toBe(
      'has no Flask of Oil for the Lantern, Hooded',
    );
  });
});
