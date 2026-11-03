import { describe, expect, it } from 'vitest';
import { importSummary, leftOutDetail } from './foundry-report.ts';

describe('importSummary', () => {
  it('counts what a Foundry world brought', () => {
    const report = {
      name: 'Keep',
      scenes: 1,
      actors: 2,
      tokens: 3,
      journals: 1,
      tables: 0,
      playlists: 2,
      media: 9,
      left: [],
    };
    expect(importSummary(report)).toBe('1 scene, 2 actors, 3 tokens, 1 journal entry, 0 tables, 2 playlists, 9 files');
  });

  it('says where a kind of left-out thing was and names a few', () => {
    const few = { what: 'Walls that stop nothing', count: 3, examples: [], places: ['Crypt', 'Inn'], placeCount: 2 };
    expect(leftOutDetail(few)).toBe('in Crypt, Inn');
    const many = { what: 'Tokens', count: 9, examples: ['tree', 'torch'], places: ['Crypt'], placeCount: 4 };
    expect(leftOutDetail(many)).toBe('in 4 places: Crypt, … · tree, torch, …');
  });
});
