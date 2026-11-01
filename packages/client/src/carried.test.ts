import { describe, expect, it } from 'vitest';
import { bagLayout, carriedDrag, carriedLook, loadText, purseText } from './carried.ts';

describe('what a creature carries, on its sheet', () => {
  it('names a scroll after its spell and drags it as a scroll', () => {
    const scroll = { item: 'spell-scroll', spell: 'fireball', qty: 2, equipped: false };
    expect(carriedLook(scroll, '2014')).toMatchObject({
      name: 'Spell Scroll of Fireball',
      ref: 'scroll:fireball',
      tip: { title: 'Spell Scroll of Fireball', subtitle: '3rd-level evocation scroll' },
    });
    expect(carriedDrag('hero', scroll)).toEqual({
      kind: 'carried',
      from: 'hero',
      item: 'spell-scroll',
      spell: 'fireball',
    });
  });

  it('shows other items as they are', () => {
    const dagger = { item: 'dagger', qty: 1, equipped: true };
    expect(carriedLook(dagger, '2014')).toMatchObject({ name: 'Dagger', ref: 'item:dagger' });
    expect(carriedDrag('hero', dagger)).toEqual({ kind: 'carried', from: 'hero', item: 'dagger' });
    expect(carriedLook({ item: 'mystery', qty: 1, equipped: false }, '2014').name).toBe('mystery');
  });

  it('shows an item made on the sheet by its name', () => {
    const own = { items: [{ type: 'gear' as const, id: 'lucky-coin', name: 'Lucky coin', weight: 0 }] };
    const coin = { item: 'lucky-coin', qty: 1, equipped: false };
    expect(carriedLook(coin, '2014', { own }).name).toBe('Lucky coin');
  });
});

describe('how the bag is laid out', () => {
  const list = [
    { item: 'backpack', id: 'pack', qty: 1, equipped: false },
    { item: 'rope', in: 'pack', qty: 1, equipped: false },
    { item: 'dagger', qty: 1, equipped: true },
    { item: 'torch', in: 'lost', qty: 2, equipped: false },
    { item: 'pouch', qty: 1, equipped: false },
  ];

  it('keeps loose gear apart and gives each container its contents and load', () => {
    const { loose, boxes } = bagLayout(list, '2014');
    expect(loose).toEqual([0, 2, 3, 4]);
    expect(boxes).toEqual([
      { index: 0, name: 'Backpack', contents: [1], load: 5, capacity: 30 },
      { index: 4, name: 'Pouch', contents: [], load: 0, capacity: 6 },
    ]);
  });

  it('describes coins and the weight carried', () => {
    expect(purseText({ gp: 12, sp: 3, cp: 0 })).toBe('12 gp · 3 sp');
    expect(purseText(undefined)).toBe('No coins');
    expect(loadText({ weight: 45.5, capacity: 150, over: false })).toBe('45.5 / 150 lb');
  });
});
