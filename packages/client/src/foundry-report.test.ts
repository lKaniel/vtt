import { describe, expect, it } from 'vitest';
import { importSummary } from './foundry-report.ts';

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
      skipped: [],
    };
    expect(importSummary(report)).toBe('1 scene, 2 actors, 3 tokens, 1 journal entry, 0 tables, 2 playlists, 9 files');
  });
});
