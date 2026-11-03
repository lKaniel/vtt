import { describe, expect, it } from 'vitest';
import { ArtFileSchema, artFromFile, artOf, mergeArt, nameKey, PackManifestSchema } from './index.ts';

describe('a pack art file', () => {
  it('names files inside the pack, one or several per key', () => {
    const file = ArtFileSchema.parse({ spell: { fireball: 'media/fire.webp', 'fire-bolt': ['media/a.webm'] } });
    expect(artFromFile('icons', file)).toEqual({
      spell: { fireball: ['pack://icons/media/fire.webp'], 'fire-bolt': ['pack://icons/media/a.webm'] },
    });
  });

  it('refuses paths that leave the pack', () => {
    expect(ArtFileSchema.safeParse({ spell: { x: '../secret.webp' } }).success).toBe(false);
  });

  it('is named by pack.json `art`', () => {
    expect(PackManifestSchema.parse({ id: 'p', name: 'p', art: 'art.json' }).art).toBe('art.json');
  });
});

describe('a game’s art', () => {
  it('takes each key from the first pack that has it', () => {
    const first = { spell: { fireball: ['pack://a/1.webp'] } };
    const second = { spell: { fireball: ['pack://b/1.webp'], shield: ['pack://b/2.webp'] }, item: { rope: ['x'] } };
    expect(mergeArt([first, second])).toEqual({
      spell: { fireball: ['pack://a/1.webp'], shield: ['pack://b/2.webp'] },
      item: { rope: ['x'] },
    });
  });

  it('looks a thing up by its keys in turn', () => {
    const art = { item: { longsword: ['pack://a/sword.webp'] } };
    expect(artOf(art, 'item', 'flame-tongue', 'longsword')).toEqual(['pack://a/sword.webp']);
    expect(artOf(art, 'item', 'rope')).toBeUndefined();
    expect(artOf(art, 'spell', 'longsword')).toBeUndefined();
  });
});

describe('a name as a key', () => {
  it('is lowercase words joined by dashes, camel case split', () => {
    expect(nameKey('Potion of Healing')).toBe('potion-of-healing');
    expect(nameKey('BrownBear')).toBe('brown-bear');
    expect(nameKey('fire_arrow')).toBe('fire-arrow');
    expect(nameKey("Healer's Kit")).toBe('healer-s-kit');
    expect(nameKey('+1 Longsword')).toBe('1-longsword');
  });
});
