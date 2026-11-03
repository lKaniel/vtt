import { describe, expect, it } from 'vitest';
import { tierOf } from './baileywiki-client.ts';
import { baileywikiFiles } from './baileywiki-import.ts';

describe('the files a Baileywiki scene needs', () => {
  it("are its Baileywiki media, decoded, and never another module's or a path out of the pack", () => {
    const scene = {
      background: { src: '/modules/baileywiki-maps/maps/a%20b.webp' },
      tiles: [
        { texture: { src: 'bw-content-releases/x/tree.webp' } },
        { texture: { src: 'modules/jb2a/fire.webm' } },
        { texture: { src: 'modules/baileywiki-3d/../../secrets.png' } },
        { texture: { src: 'icons/svg/door.svg' } },
      ],
      flags: { 'levels-3d-preview': { model3d: 'modules/baileywiki-3d/models/house.glb' } },
      notes: 'modules/baileywiki-maps/readme.txt',
    };
    expect(baileywikiFiles(scene).sort((a, b) => a.localeCompare(b))).toEqual([
      'bw-content-releases/x/tree.webp',
      'modules/baileywiki-3d/models/house.glb',
      'modules/baileywiki-maps/maps/a b.webp',
    ]);
  });
});

describe('Baileywiki tiers', () => {
  it('are the best role an account has, free without a paid one', () => {
    expect(tierOf([])).toBe('free');
    expect(tierOf(['ils0rk0o4b2mfux', 'nrnn6s6djtxkuo6'])).toBe('advanced');
    expect(tierOf(['3o21j06edq1i81i', 'other'])).toBe('vip');
  });
});
