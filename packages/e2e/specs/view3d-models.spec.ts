// 3D models in the 3D view (model3d.ts in shared): a tile with a glTF model
// stands it on the map; the 2D map draws nothing for it.

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '../support/fixtures.ts';
import { GM, atTable } from '../support/table.ts';

test.describe.configure({ timeout: 150_000 });

/** A one-triangle glTF model, its buffer inside it. */
const TRIANGLE = {
  asset: { version: '2.0' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  buffers: [
    { byteLength: 36, uri: 'data:application/octet-stream;base64,AAAAAAAAAAAAAAAAAACAPwAAAAAAAAAAAAAAAAAAgD8AAAAA' },
  ],
  bufferViews: [{ buffer: 0, byteLength: 36 }],
  accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
};

async function addModelTile(dir: string): Promise<void> {
  await writeFile(join(dir, 'assets', 'triangle.gltf'), JSON.stringify(TRIANGLE));
  const file = join(dir, 'scenes', 'crossroads', 'tiles.json');
  const tiles = JSON.parse(await readFile(file, 'utf8')) as unknown[];
  const model = { src: '/assets/triangle.gltf', fill: 'tile', piece: 1, height: 5 };
  const tile = { id: 'ramp', kind: 'image', x: 1000, y: 800, w: 200, h: 100, src: '/art/ui/blank.svg', model };
  await writeFile(file, JSON.stringify([...tiles, tile], null, 2));
}

test.use({ serverOptions: { prepare: addModelTile } });

test('a model tile stands its model in the 3D view, repeated across the tile', async ({ page }) => {
  await atTable(page, GM);
  await page.getByRole('button', { name: '3D view' }).click();
  await expect(page.getByTestId('view3d')).toHaveAttribute('data-models', '2', { timeout: 30_000 });
});
