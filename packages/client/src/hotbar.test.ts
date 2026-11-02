import { type Attack, srdFor, type TokenView } from '@vtt/system-dnd5e';
import { describe, expect, it } from 'vitest';
import {
  HOTBAR_SIZE,
  hotbarSlots,
  hotbarTiles,
  moveOnHotbar,
  placeOnHotbar,
  removeFromHotbar,
  tileRef,
  floatTransform,
  landTransform,
} from './hotbar.ts';
import { costOf } from './actions.ts';

const spell = (id: string) => srdFor('2014').spells.get(id)!;
const staff: Attack = { name: 'Quarterstaff', kind: 'melee', toHit: 1, damage: [{ dice: '1d6', type: 'bludgeoning' }] };

function wizard(hotbar?: (string | null)[]): TokenView {
  return {
    id: 'orrin',
    name: 'Orrin',
    x: 0,
    y: 0,
    size: 1,
    color: '#38f',
    speed: 30,
    darkvision: 0,
    hidden: false,
    inventory: [
      { item: 'quarterstaff', equipped: true, qty: 1 },
      { item: 'potion-of-healing', equipped: false, qty: 2 },
    ],
    ...(hotbar ? { hotbar } : {}),
    sheet: {
      attacks: [staff],
      features: [],
      caster: { spells: [spell('fire-bolt'), spell('magic-missile')], left: [1], slots: [2] },
    } as unknown as TokenView['sheet'],
  };
}

const refs = (t: TokenView) => hotbarTiles(t).map((tile) => (tile ? tileRef(tile) : null));

describe('items on the hotbar', () => {
  const potionTile = (t: TokenView) =>
    hotbarTiles(t).find((tile) => tile && tileRef(tile) === 'item:potion-of-healing')!;

  it('costs an action to drink a potion in 2014 and a bonus action in 2024', () => {
    const t = wizard(['item:potion-of-healing']);
    expect(costOf(potionTile({ ...t, sheet: { ...t.sheet!, edition: '2014' } }))).toBe('action');
    expect(costOf(potionTile({ ...t, sheet: { ...t.sheet!, edition: '2024' } }))).toBe('bonus');
  });
});

describe('spell scrolls', () => {
  const scrolled = (hotbar: (string | null)[]): TokenView => ({
    ...wizard(hotbar),
    inventory: [{ item: 'spell-scroll', spell: 'fireball', qty: 2, equipped: false }],
  });

  it('puts a scroll on the bar by hand as its spell, with how many are carried', () => {
    const tile = hotbarTiles(scrolled(['scroll:fireball']))[0]!;
    expect(tile).toMatchObject({ kind: 'spell', name: 'Scroll of Fireball', scroll: true, uses: '2', spent: false });
    expect(tileRef(tile)).toBe('scroll:fireball');
    expect(refs(scrolled([]))).not.toContain('scroll:fireball');
    expect(hotbarTiles(scrolled(['scroll:shield']))[0]?.name).not.toBe('Scroll of Shield');
  });
});

describe('the hotbar', () => {
  it('lays everything out in order when nothing was arranged, padded to the bar size', () => {
    const r = refs(wizard());
    expect(r.slice(0, 4)).toEqual(['attack:Quarterstaff', 'spell:fire-bolt', 'spell:magic-missile', null]);
    expect(r).toHaveLength(HOTBAR_SIZE);
  });

  it('follows the saved layout, gives hotkeys by slot and adds new things in the gaps', () => {
    const tiles = hotbarTiles(wizard([null, 'spell:magic-missile', 'item:potion-of-healing', null, 'spell:gone']));
    expect(tiles.slice(0, 5).map((t) => t && tileRef(t))).toEqual([
      'attack:Quarterstaff',
      'spell:magic-missile',
      'item:potion-of-healing',
      'spell:fire-bolt',
      null,
    ]);
    expect(tiles[1]!.hotkey).toBe('2');
    expect(tiles[2]).toMatchObject({ kind: 'item', name: 'Potion of Healing', uses: '2' });
  });

  it('drops items the creature no longer carries', () => {
    const t = { ...wizard(['item:potion-of-healing']), inventory: [] };
    expect(refs(t)[0]).toBe('attack:Quarterstaff');
  });

  it('swaps two slots, and places a dragged-in thing (moving it if it was already on the bar)', () => {
    const slots = refs(wizard());
    expect(moveOnHotbar(slots, 0, 2).slice(0, 3)).toEqual([
      'spell:magic-missile',
      'spell:fire-bolt',
      'attack:Quarterstaff',
    ]);
    expect(placeOnHotbar(slots, 'item:potion-of-healing', 5)[5]).toBe('item:potion-of-healing');
    const moved = placeOnHotbar(slots, 'spell:fire-bolt', 6);
    expect(moved[1]).toBeNull();
    expect(moved[6]).toBe('spell:fire-bolt');
    expect(removeFromHotbar(slots, 0)[0]).toBeNull();
  });
});

describe('macros on the hotbar', () => {
  const macros = (id: string) => (id === 'hail' ? { id: 'hail', name: 'Hail', img: 'hail.webp' } : undefined);

  it('shows a macro placed on the bar, free to run, with its picture', () => {
    const tile = hotbarTiles(wizard(['macro:hail']), macros)[0]!;
    expect(tile).toMatchObject({ kind: 'macro', name: 'Hail', hotkey: '1', spent: false });
    expect(tile.icon.art).toContain('hail.webp');
    expect(tileRef(tile)).toBe('macro:hail');
    expect(costOf(tile)).toBe('free');
  });

  it('keeps a macro the bar can no longer find out of the slots it saves', () => {
    expect(hotbarSlots(wizard(['macro:gone']), macros)[0]).toBe('attack:Quarterstaff');
    expect(hotbarSlots(wizard(['macro:hail']), macros)[0]).toBe('macro:hail');
  });
});

describe('a tile in the air', () => {
  it('centres on the cursor, lifted, and lands square on its slot', () => {
    expect(floatTransform([100, 50], [40, 40], 1.15)).toBe('translate(80px, 30px) scale(1.15)');
    expect(landTransform({ left: 300, top: 600, width: 40, height: 40 }, [40, 40])).toBe(
      'translate(300px, 600px) scale(1)',
    );
  });
});
