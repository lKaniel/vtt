import { describe, expect, it } from 'vitest';
import {
  enabledPacks,
  type MediaEntry,
  mediaKind,
  mediaTags,
  PackManifestSchema,
  packRef,
  packUrl,
  parsePackRef,
  searchMedia,
} from './index.ts';

describe('a pack manifest', () => {
  it('fills in what a hand-written pack.json leaves out', () => {
    const pack = PackManifestSchema.parse({ id: 'forest-tiles', name: 'Forest tiles' });
    expect(pack).toMatchObject({ version: '1.0.0', system: null, compendia: [], media: 'media/' });
  });

  it('refuses ids that are not lowercase slugs and compendia that leave the pack', () => {
    expect(PackManifestSchema.safeParse({ id: 'Forest Tiles', name: 'x' }).success).toBe(false);
    const escape = { id: 'p', name: 'p', compendia: [{ id: 'a', type: 'scene', path: '../secret.json' }] };
    expect(PackManifestSchema.safeParse(escape).success).toBe(false);
  });
});

describe('pack references', () => {
  it('names a file in a pack and finds it again', () => {
    expect(packRef('forest-tiles', 'media/oak.webp')).toBe('pack://forest-tiles/media/oak.webp');
    expect(parsePackRef('pack://forest-tiles/media/oak.webp')).toEqual({ pack: 'forest-tiles', path: 'media/oak.webp' });
    expect(parsePackRef('/assets/oak.webp')).toBeUndefined();
    expect(parsePackRef('pack://forest-tiles/../game.json')).toBeUndefined();
  });

  it('is served under /packs/', () => {
    expect(packUrl('pack://forest-tiles/media/big oak.webp')).toBe('/packs/forest-tiles/media/big%20oak.webp');
    expect(packUrl('/art/x.png')).toBeUndefined();
  });
});

describe('media', () => {
  it('knows pictures, sounds and videos by their extension', () => {
    expect(mediaKind('maps/cave.WEBP')).toBe('image');
    expect(mediaKind('sfx/door.ogg')).toBe('audio');
    expect(mediaKind('fx/fire.webm')).toBe('video');
    expect(mediaKind('module.json')).toBeUndefined();
  });

  it('tags a file with the folders it is in, inside the media folder', () => {
    expect(mediaTags('Tokens/Undead_Skeletons/archer.webp')).toEqual(['tokens', 'undead skeletons']);
    expect(mediaTags('oak.webp')).toEqual([]);
  });

  const media: MediaEntry[] = [
    { src: 'pack://f/media/trees/oak.webp', name: 'oak', kind: 'image', tags: ['trees'], pack: 'f' },
    { src: 'pack://f/media/trees/dead-oak.webp', name: 'dead-oak', kind: 'image', tags: ['trees', 'dead'], pack: 'f' },
    { src: '/assets/oak-ambience.ogg', name: 'oak-ambience', kind: 'audio', tags: [] },
  ];

  it('finds media by every word of a query, in names and tags, names starting with it first', () => {
    expect(searchMedia(media, { query: 'oak' }).map((m) => m.name)).toEqual(['oak', 'oak-ambience', 'dead-oak']);
    expect(searchMedia(media, { query: 'dead tree' }).map((m) => m.name)).toEqual(['dead-oak']);
  });

  it('narrows to a tag, a kind or a pack', () => {
    expect(searchMedia(media, { tag: 'dead' }).map((m) => m.name)).toEqual(['dead-oak']);
    expect(searchMedia(media, { kind: 'audio' }).map((m) => m.name)).toEqual(['oak-ambience']);
    expect(searchMedia(media, { pack: 'f' })).toHaveLength(2);
  });
});

describe('the packs a game uses', () => {
  const installed = [
    PackManifestSchema.parse({ id: 'forest', name: 'Forest' }),
    PackManifestSchema.parse({ id: 'goblins', name: 'Goblins', system: 'dnd5e' }),
    PackManifestSchema.parse({ id: 'stars', name: 'Stars', system: 'starfinder' }),
  ];

  it('are the ones its game.json names, of its system or of none', () => {
    expect(enabledPacks(installed, ['goblins', 'stars', 'gone'], 'dnd5e').map((p) => p.id)).toEqual(['goblins']);
    expect(enabledPacks(installed, undefined, 'dnd5e')).toEqual([]);
  });
});
