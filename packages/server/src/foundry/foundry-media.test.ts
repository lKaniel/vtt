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
});
