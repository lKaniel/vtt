import { describe, expect, it } from 'vitest';
import zoneArt from '../content/zone-art.json' with { type: 'json' };
import { zoneArtUrl } from './zone-art.ts';

describe('bundled spell zone art', () => {
  it('returns the bundled webp path for spells with zone art', () => {
    expect(zoneArtUrl('web')).toBe('/art/textures/zones/web.webp');
    expect(zoneArtUrl('fog-cloud')).toBe('/art/textures/zones/fog-cloud.webp');
    expect(zoneArtUrl('wall-of-stone')).toBe('/art/textures/zones/wall-of-stone.webp');
  });

  it('returns undefined when a spell has no bundled zone art', () => {
    expect(zoneArtUrl('fireball')).toBeUndefined();
    expect(zoneArtUrl('no-such-spell')).toBeUndefined();
  });

  it('keeps zone-art.json sorted and without duplicates', () => {
    const sorted = [...new Set(zoneArt)].sort((a, b) => a.localeCompare(b));
    expect(zoneArt).toEqual(sorted);
  });
});
