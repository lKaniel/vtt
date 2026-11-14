import { describe, expect, it } from 'vitest';
import type { Player } from '@vtt/shared';
import { activeLook, disguiseText, shownImg, shownName, srdFor, TokenSchema, viewToken } from './index.ts';

const gm: Player = { id: 'gm', name: 'GM', role: 'gm', color: '#fff' };
const ana: Player = { id: 'ana', name: 'Ana', role: 'player', color: '#fff' };
const bo: Player = { id: 'bo', name: 'Bo', role: 'player', color: '#fff' };

const looks = [
  { id: 'merchant', label: 'Merchant', name: 'Old Tobin', img: '/assets/uploads/tobin.webp' },
  { id: 'hood', label: 'Hood up', img: '/assets/uploads/hood.webp' },
];
const bram = TokenSchema.parse({
  id: 'bram',
  name: 'Bram',
  x: 0,
  y: 0,
  img: '/assets/uploads/bram.webp',
  ownership: { default: 'limited', ana: 'owner' },
  stats: { maxHp: 12 },
  looks,
  look: 'merchant',
});

describe('disguises', () => {
  it('shows the worn look, else the creature as it is', () => {
    expect(activeLook(bram)?.label).toBe('Merchant');
    expect([shownName(bram), shownImg(bram)]).toEqual(['Old Tobin', '/assets/uploads/tobin.webp']);
    const hood = { ...bram, look: 'hood' };
    expect([shownName(hood), shownImg(hood)]).toEqual(['Bram', '/assets/uploads/hood.webp']);
    const own = { ...bram, look: undefined };
    expect([shownName(own), shownImg(own), activeLook(own)]).toEqual(['Bram', '/assets/uploads/bram.webp', undefined]);
    expect(activeLook({ ...bram, look: 'gone' })).toBeUndefined();
  });

  it('tells other players only the disguise, never the true look or the other looks', () => {
    const seen = viewToken(bram, bo, srdFor('2024'));
    expect(seen).toMatchObject({ name: 'Old Tobin', img: '/assets/uploads/tobin.webp' });
    expect(seen).not.toHaveProperty('looks');
    expect(seen).not.toHaveProperty('look');
    expect(JSON.stringify(seen)).not.toContain('Bram');
  });

  it('lets the owner and the GM see both', () => {
    for (const who of [ana, gm]) {
      const seen = viewToken(bram, who, srdFor('2024'));
      expect(seen).toMatchObject({ name: 'Bram', img: '/assets/uploads/bram.webp', look: 'merchant' });
      expect(seen.looks).toHaveLength(2);
    }
  });

  it('names a disguised creature in chat by its disguise', () => {
    const text = disguiseText('Bram hits Bramble the goblin. Bram rolls 14.', [bram]);
    expect(text).toBe('Old Tobin hits Bramble the goblin. Old Tobin rolls 14.');
    expect(disguiseText('Bram waves', [{ ...bram, look: 'hood' }])).toBe('Bram waves');
    const merchant = { ...bram, looks: [{ id: 'm', label: 'M', name: 'Bram the Merchant' }], look: 'm' };
    const once = disguiseText('Bram waves', [merchant]);
    expect(disguiseText(once, [merchant])).toBe('Bram the Merchant waves');
  });
});
