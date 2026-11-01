import { describe, expect, it } from 'vitest';
import { carriedDrag, carriedLook } from './carried.ts';

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
