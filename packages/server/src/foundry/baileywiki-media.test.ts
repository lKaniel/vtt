import { describe, expect, it } from 'vitest';
import { mediaLookup } from './baileywiki-media.ts';

const have = new Set([
  'modules/baileywiki-maps-premium-towns/maps/active-tiles/active-tile-2x2.webp',
  'modules/baileywiki-maps-premium-towns/sounds/aura1.ogg',
  'modules/baileywiki-maps-premium-towns/maps/wilderness/grass/bw-terrain-grass-01-seamless2.webp',
  'modules/baileywiki-maps/maps/castle/towers/rooms-flattened/tower-c05x05-lighthouse.webp',
  'modules/baileywiki-maps/maps/docks.webp',
  'modules/baileywiki-maps/maps/a/tree.webp',
  'modules/baileywiki-maps/maps/b/tree.webp',
]);

const ref = (p: string) => `pack://baileywiki/media/${p}`;

describe('finding the files a Baileywiki scene names', () => {
  const missing = new Set<string>();
  const media = mediaLookup({ have, pack: 'baileywiki' }, missing);

  it('finds a file where Foundry has it', () => {
    expect(media('modules/baileywiki-maps/maps/docks.webp')).toBe(ref('modules/baileywiki-maps/maps/docks.webp'));
  });

  it('finds a file a module update turned from png into webp, or mp3 into ogg', () => {
    expect(media('modules/baileywiki-maps-premium-towns/maps/active-tiles/active-tile-2x2.png')).toBe(
      ref('modules/baileywiki-maps-premium-towns/maps/active-tiles/active-tile-2x2.webp'),
    );
    expect(media('modules/baileywiki-maps-premium-towns/sounds/aura1.mp3')).toBe(
      ref('modules/baileywiki-maps-premium-towns/sounds/aura1.ogg'),
    );
  });

  it('finds a file a module update moved to another folder of the module, when only one has that name', () => {
    expect(media('modules/baileywiki-maps-premium-towns/maps/wilderness/webp/bw-terrain-grass-01-seamless2.webp')).toBe(
      ref('modules/baileywiki-maps-premium-towns/maps/wilderness/grass/bw-terrain-grass-01-seamless2.webp'),
    );
    expect(media('modules/baileywiki-maps/maps/c/tree.webp')).toBeUndefined();
  });

  it('finds a file another Baileywiki module has at the same path', () => {
    expect(
      media('modules/baileywiki-maps-premium-towns/maps/castle/towers/rooms-flattened/tower-c05x05-lighthouse.webp'),
    ).toBe(ref('modules/baileywiki-maps/maps/castle/towers/rooms-flattened/tower-c05x05-lighthouse.webp'));
  });

  it('reports what it can’t find', () => {
    expect(media('modules/jb2a_patreon/fire.webm')).toBeUndefined();
    expect(missing).toContain('modules/jb2a_patreon/fire.webm');
    expect(missing).not.toContain('modules/baileywiki-maps-premium-towns/sounds/aura1.mp3');
  });
});
