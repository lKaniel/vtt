import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { foundryArtFile, foundryArtPath, importFoundryArt } from './foundry-art.ts';

describe('where a Foundry picture goes in an icons pack', () => {
  it('puts core icons under media/icons and the system’s under media/<system>', () => {
    expect(foundryArtPath('icons/magic/fire/projectile-fireball.webp', 'dnd5e')).toBe(
      'media/icons/magic/fire/projectile-fireball.webp',
    );
    expect(foundryArtPath('systems/dnd5e/tokens/undead/Skeleton.webp', 'dnd5e')).toBe(
      'media/dnd5e/tokens/undead/Skeleton.webp',
    );
    expect(foundryArtPath('modules/other/x.webp', 'dnd5e')).toBeUndefined();
    expect(foundryArtPath('https://example.com/x.webp', 'dnd5e')).toBeUndefined();
  });
});

describe('an art file from a Foundry system’s compendia', () => {
  const docs = [
    { name: 'Fireball', type: 'spell', img: 'icons/magic/fire/explosion-fireball-large-red-orange.webp' },
    { name: 'Longsword', type: 'weapon', img: 'icons/weapons/swords/greatsword-crossguard-steel.webp' },
    { name: 'Second Wind', type: 'feat', img: 'icons/magic/life/cross-worn-green.webp' },
    { name: 'Rope, Hempen (50 feet)', type: 'loot', img: 'icons/sundries/survival/rope-wrapped-brown.webp' },
    { name: 'Mystery', type: 'loot', img: 'icons/svg/item-bag.svg' },
    {
      name: 'Skeleton',
      type: 'npc',
      img: 'systems/dnd5e/tokens/undead/Skeleton.webp',
      prototypeToken: { texture: { src: 'systems/dnd5e/tokens/undead/Skeleton.webp' } },
    },
    { name: 'Fireball', type: 'spell', img: 'icons/magic/fire/other.webp' },
  ];

  it('names each document’s picture by kind and name, the first of a name winning', () => {
    expect(foundryArtFile(docs, 'dnd5e')).toEqual({
      spell: { fireball: 'media/icons/magic/fire/explosion-fireball-large-red-orange.webp' },
      item: {
        longsword: 'media/icons/weapons/swords/greatsword-crossguard-steel.webp',
        'rope-hempen-50-feet': 'media/icons/sundries/survival/rope-wrapped-brown.webp',
        rope: 'media/icons/sundries/survival/rope-wrapped-brown.webp',
      },
      feature: { 'second-wind': 'media/icons/magic/life/cross-worn-green.webp' },
      monster: { skeleton: 'media/dnd5e/tokens/undead/Skeleton.webp' },
    });
  });
});

describe('importing Foundry’s icons as a pack', () => {
  it('copies the core icons and the system’s icons and tokens, and names them for its compendia', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vtt-foundry-art-'));
    const put = async (path: string, data: string) => {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), data);
    };
    await put('icons/magic/fire/fireball.webp', 'x');
    await put('dnd5e/system.json', JSON.stringify({ id: 'dnd5e', packs: [{ path: 'packs/spells', type: 'Item' }] }));
    await put(
      'dnd5e/packs/spells.db',
      JSON.stringify({ _id: 'a', name: 'Fireball', type: 'spell', img: 'icons/magic/fire/fireball.webp' }),
    );
    await put('dnd5e/icons/svg/statuses/blinded.svg', 'x');
    await put('dnd5e/tokens/undead/Skeleton.webp', 'x');
    const report = await importFoundryArt(
      { icons: join(root, 'icons'), system: join(root, 'dnd5e') },
      join(root, 'packs'),
    );
    expect(report).toMatchObject({ id: 'foundry-icons', pictures: 1 });
    const pack = join(root, 'packs/foundry-icons');
    expect(JSON.parse(await readFile(join(pack, 'pack.json'), 'utf8'))).toMatchObject({
      art: 'art.json',
      license: 'private',
    });
    expect(JSON.parse(await readFile(join(pack, 'art.json'), 'utf8'))).toEqual({
      spell: { fireball: 'media/icons/magic/fire/fireball.webp' },
    });
    await expect(readFile(join(pack, 'media/dnd5e/tokens/undead/Skeleton.webp'), 'utf8')).resolves.toBe('x');
    await expect(readFile(join(pack, 'media/dnd5e/icons/svg/statuses/blinded.svg'), 'utf8')).resolves.toBe('x');
    await expect(
      importFoundryArt({ icons: join(root, 'icons'), system: join(root, 'dnd5e') }, join(root, 'packs')),
    ).rejects.toThrow(/overwrite/);
  });
});
