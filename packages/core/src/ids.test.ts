import { describe, expect, it } from 'vitest';
import { freeId, slugify } from './ids.ts';

describe('ids', () => {
  it('takes the lowest free number for a prefix', () => {
    const taken = new Set(['wall-1', 'wall-2', 'wall-4']);
    expect(freeId('wall', (id) => taken.has(id))).toBe('wall-3');
  });

  it('keeps the bare name when it is free', () => {
    expect(freeId('goblin', () => false, { bare: true })).toBe('goblin');
    expect(freeId('goblin', (id) => id === 'goblin', { bare: true })).toBe('goblin-2');
  });

  it('turns names into ids', () => {
    expect(slugify('Bandit Captain!')).toBe('bandit-captain');
    expect(slugify('  Ünder  the Hill ')).toBe('under-the-hill');
    expect(slugify('***')).toBe('item');
  });
});
