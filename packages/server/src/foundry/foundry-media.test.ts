import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FoundryMedia } from './foundry-media.ts';

// The files a Foundry world uses are copied into the game. A .gltf model
// keeps its buffers and textures in files beside it, which come too.

async function put(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

describe('copying a world’s media', () => {
  it('copies a .gltf model with the buffers and textures it names', async () => {
    const data = await mkdtemp(join(tmpdir(), 'foundry-data-'));
    const gltf = {
      buffers: [{ uri: 'house.bin' }, { uri: 'data:application/octet-stream;base64,AA==' }],
      images: [{ uri: 'tex/wood.png' }],
    };
    await put(join(data, 'modules/kit/house.gltf'), JSON.stringify(gltf));
    await put(join(data, 'modules/kit/house.bin'), 'bin');
    await put(join(data, 'modules/kit/tex/wood.png'), 'png');
    const media = new FoundryMedia({ dir: join(data, 'worlds/w'), id: 'w' }, data);
    expect(media.lookup('modules/kit/house.gltf')).toBe('/assets/foundry/modules/kit/house.gltf');
    const game = await mkdtemp(join(tmpdir(), 'game-'));
    await media.copyTo(game);
    const copied = join(game, 'assets/foundry/modules/kit');
    expect(await readFile(join(copied, 'house.bin'), 'utf8')).toBe('bin');
    expect(await readFile(join(copied, 'tex/wood.png'), 'utf8')).toBe('png');
  });

  it('copies a text glTF named .glb with parts in sibling folders, but nothing outside the Data folder', async () => {
    const data = await mkdtemp(join(tmpdir(), 'foundry-data-'));
    const gltf = {
      buffers: [{ uri: '../zz-meshes/wall.bin' }],
      images: [{ uri: '../zz-textures/T_Wall%2001.webp' }, { uri: '../../../../../secret.png' }],
    };
    await put(join(data, 'modules/kit/walls/wall.glb'), JSON.stringify(gltf));
    await put(join(data, 'modules/kit/zz-meshes/wall.bin'), 'bin');
    await put(join(data, 'modules/kit/zz-textures/T_Wall 01.webp'), 'webp');
    const media = new FoundryMedia({ dir: join(data, 'worlds/w'), id: 'w' }, data);
    expect(media.lookup('modules/kit/walls/wall.glb')).toBe('/assets/foundry/modules/kit/walls/wall.glb');
    const game = await mkdtemp(join(tmpdir(), 'game-'));
    await media.copyTo(game);
    const copied = join(game, 'assets/foundry/modules/kit');
    expect(await readFile(join(copied, 'zz-meshes/wall.bin'), 'utf8')).toBe('bin');
    expect(await readFile(join(copied, 'zz-textures/T_Wall 01.webp'), 'utf8')).toBe('webp');
  });

  it('finds files a world names by their Forge address in the Data folder', async () => {
    const data = await mkdtemp(join(tmpdir(), 'foundry-data-'));
    await put(join(data, 'modules/kit/walls/wall.glb'), 'glb');
    await put(join(data, 'modules/c3d/hill.webp'), 'webp');
    const media = new FoundryMedia({ dir: join(data, 'worlds/w'), id: 'w' }, data);
    expect(media.lookup('https://assets.forge-vtt.com/5f621fac18960d70840e7ad8/modules/kit/walls/wall.glb')).toBe(
      '/assets/foundry/modules/kit/walls/wall.glb',
    );
    expect(media.lookup('https://assets.forge-vtt.com/bazaar/modules/c3d/hill.webp')).toBe(
      '/assets/foundry/modules/c3d/hill.webp',
    );
    // The Bazaar's copy of a module can sit one folder deeper ("assets/assets/") than the installed one.
    await put(join(data, 'modules/c3d/assets/Terrain/hills-1.webp'), 'webp');
    expect(media.lookup('https://assets.forge-vtt.com/bazaar/modules/c3d/assets/assets/Terrain/hills-1.webp')).toBe(
      '/assets/foundry/modules/c3d/assets/Terrain/hills-1.webp',
    );
    expect(media.lookup('https://assets.forge-vtt.com/bazaar/modules/c3d/gone.webp')).toBe(
      'https://assets.forge-vtt.com/bazaar/modules/c3d/gone.webp',
    );
  });

  it("finds the pictures a Monk's Active Tiles pattern names", async () => {
    const data = await mkdtemp(join(tmpdir(), 'foundry-data-'));
    for (const f of ['bw_tree_01.webp', 'bw_tree_02.webp', 'bw_rock.webp', 'bw_tree.txt'])
      await put(join(data, 'modules/kit/props', f), 'x');
    const media = new FoundryMedia({ dir: join(data, 'worlds/w'), id: 'w' }, data);
    expect(media.glob('modules/kit/props/bw_tree*')).toEqual([
      '/assets/foundry/modules/kit/props/bw_tree_01.webp',
      '/assets/foundry/modules/kit/props/bw_tree_02.webp',
    ]);
    expect(media.glob('modules/../secret/*')).toEqual([]);
  });
});
