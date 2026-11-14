import { describe, expect, it } from 'vitest';
import type { TokenView } from '@vtt/system-dnd5e';
import { cutoutOf } from '../icon-art.ts';
import { mapName, newLook, wearPatch } from './looks.ts';

const bram = {
  id: 'bram',
  name: 'Bram',
  img: '/assets/bram.webp',
  looks: [{ id: 'merchant', label: 'Merchant', name: 'Old Tobin', img: '/assets/tobin.webp' }],
  look: 'merchant',
} as TokenView;

describe('looks', () => {
  it('draws the worn look on the map', () => {
    expect(cutoutOf(bram)).toBe('/assets/tobin.webp');
    expect(cutoutOf({ ...bram, look: undefined })).toBe('/assets/bram.webp');
  });

  it('names it by its disguise, with its own name for those who know', () => {
    expect(mapName(bram)).toEqual({ name: 'Old Tobin', really: 'Bram' });
    expect(mapName({ ...bram, look: undefined })).toEqual({ name: 'Bram' });
  });

  it('adds a look with an id of its own, from the current picture', () => {
    const next = newLook(bram.looks, 'Look', '/assets/bram.webp');
    expect(next).toMatchObject({ label: 'Look 2', img: '/assets/bram.webp' });
    expect(next.id).not.toBe('merchant');
    expect(newLook(undefined, 'Look')).toMatchObject({ id: 'look-1', label: 'Look 1' });
  });

  it('puts a look on, or takes it off', () => {
    expect(wearPatch('merchant')).toEqual({ look: 'merchant' });
    expect(wearPatch('')).toEqual({ look: null });
  });
});
