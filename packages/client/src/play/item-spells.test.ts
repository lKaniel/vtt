import { resolveCreature, srdFor, TokenSchema, type TokenView } from '@vtt/system-dnd5e';
import { describe, expect, it } from 'vitest';
import { itemAiming, itemSlots, itemSpellTiles } from './item-spells.ts';
import { castMessage } from './targeting.ts';

// Spells cast from wands and staffs, on the action bar.

function holder(inventory: object[]): TokenView {
  const token = TokenSchema.parse({ id: 'w', name: 'W', x: 0, y: 0, stats: { level: 5, maxHp: 20 }, inventory });
  return { ...token, sheet: resolveCreature(token, srdFor('2014')) };
}

describe('spells from items', () => {
  const wand = { item: 'wand-of-fireballs', equipped: true, attuned: true, spent: 2 };

  it('are tiles with the charges left, cast at the lowest level they allow', () => {
    const [tile] = itemSpellTiles(holder([wand]));
    expect(tile).toMatchObject({ kind: 'spell', name: 'Fireball (Wand of Fireballs)', slot: 3, item: 0, uses: '5' });
    expect(itemSpellTiles(holder([{ ...wand, spent: 7 }]))[0]?.spent).toBe(true);
  });

  it('can be upcast with more charges, and are sent with the item', () => {
    const token = holder([wand]);
    expect(itemSlots(token, 0, 'fireball')).toEqual([3, 4, 5, 6, 7]);
    const aiming = itemAiming(token, 0, 'fireball', 4)!;
    expect(castMessage('w', aiming, [1, 1])).toMatchObject({ t: 'cast', spell: 'fireball', slot: 4, item: 0 });
  });
});
