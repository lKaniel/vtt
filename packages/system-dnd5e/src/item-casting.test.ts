import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { itemCaster, itemCastProblem, itemCasts, rechargeItems, spendItemCast } from './item-casting.ts';
import { type Token, TokenSchema } from './token-schema.ts';

// Wands, staffs and rings that cast spells from their charges.

const book = srdFor('2014');
const wizard = (inventory: object[]) =>
  TokenSchema.parse({
    id: 'w',
    name: 'Wizard',
    x: 50,
    y: 50,
    stats: { class: 'wizard', level: 5, maxHp: 20, abilities: { int: 18 } },
    inventory,
  });
const sheet = (t: Token) => resolveCreature(t, book)!;
const wand = { item: 'wand-of-fireballs', equipped: true, attuned: true };

describe('casting from an item', () => {
  it('lists the spells a working item casts, with what each costs', () => {
    expect(itemCasts(wizard([wand]), book)).toEqual([
      { index: 0, item: 'wand-of-fireballs', spell: 'fireball', cost: 'level', less: 2, left: 7, max: 7 },
    ]);
    expect(itemCasts(wizard([{ ...wand, attuned: false }]), book)).toEqual([]);
  });

  it('spends a charge for a 3rd-level fireball and one more per level above', () => {
    const t = wizard([wand]);
    expect(itemCastProblem(t, book, { index: 0, spell: 'fireball', slot: 3 })).toBeUndefined();
    expect(spendItemCast(t, book, { index: 0, spell: 'fireball', slot: 5 }).inventory?.[0]?.spent).toBe(3);
    const spent = wizard([{ ...wand, spent: 6 }]);
    expect(itemCastProblem(spent, book, { index: 0, spell: 'fireball', slot: 4 })).toMatch(/charges/);
    expect(itemCastProblem(t, book, { index: 0, spell: 'fireball', slot: 2 })).toMatch(/3rd/);
  });

  it("casts a fixed-cost spell at the item's level (staff of fire: wall of fire at 4th for 4)", () => {
    const t = wizard([{ item: 'staff-of-fire', equipped: true, attuned: true }]);
    expect(itemCastProblem(t, book, { index: 0, spell: 'wall-of-fire', slot: 5 })).toMatch(/4th/);
    expect(spendItemCast(t, book, { index: 0, spell: 'wall-of-fire', slot: 4 }).inventory?.[0]?.spent).toBe(4);
  });

  it("uses the item's own save DC when it has one, else the wielder's", () => {
    const t = wizard([wand, { item: 'staff-of-fire', equipped: true, attuned: true }]);
    const fireball = book.spells.get('fireball')!;
    expect(itemCaster(sheet(t), book.items.get('wand-of-fireballs')!, fireball).dc).toBe(15);
    expect(itemCaster(sheet(t), book.items.get('staff-of-fire')!, fireball).dc).toBe(sheet(t).caster!.dc);
  });

  it('regains charges on a long rest, never more than it holds', () => {
    const t = wizard([{ ...wand, spent: 6 }]);
    const rested = rechargeItems(t, book, () => 0.999);
    expect(rested.inventory?.[0]?.spent).toBeUndefined();
    // 1d6+1 at its lowest gives back 2.
    expect(rechargeItems(t, book, () => 0).inventory?.[0]?.spent).toBe(4);
  });
});
