// 3D models in the 3D view (model3d.ts in shared): a tile with a glTF model
// stands it on the map; the 2D map draws nothing for it. A tile with a drawn
// solid (solid3d.ts) raises its outline; a terrain tile (terrain3d.ts) raises
// ground from its heightmap.

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '../support/fixtures.ts';
import { TRIANGLE } from '../support/models.ts';
import { GM, atTable } from '../support/table.ts';

test.describe.configure({ timeout: 150_000 });

async function addModelTile(dir: string): Promise<void> {
  await writeFile(join(dir, 'assets', 'triangle.gltf'), JSON.stringify(TRIANGLE));
  const file = join(dir, 'scenes', 'crossroads', 'tiles.json');
  const tiles = JSON.parse(await readFile(file, 'utf8')) as unknown[];
  const model = { src: '/assets/triangle.gltf', fill: 'tile', piece: 1, height: 5 };
  const tile = { id: 'ramp', kind: 'image', x: 1000, y: 800, w: 200, h: 100, src: '/art/ui/blank.svg', model };
  const solid = {
    points: [
      [0, 0],
      [1, 0],
      [0.5, 1],
    ],
    height: 10,
    color: '#556b2f',
  };
  const ledge = { id: 'ledge', kind: 'image', x: 1300, y: 800, w: 200, h: 200, src: '/art/ui/blank.svg', solid };
  // A heightmap whiter (higher) to the east.
  const ramp =
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><linearGradient id="g">' +
    '<stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient></defs>' +
    '<rect width="64" height="64" fill="url(#g)"/></svg>';
  await writeFile(join(dir, 'assets', 'ramp.svg'), ramp);
  const terrain = {
    heightmap: '/assets/ramp.svg',
    highIsWhite: true,
    height: 15,
    layers: [
      { from: 0, color: '#556b2f' },
      { from: 0.6, color: '#8a7f70' },
    ],
  };
  const hill = { id: 'hill', kind: 'image', x: 1600, y: 600, w: 400, h: 400, src: '/art/ui/blank.svg', terrain };
  await writeFile(file, JSON.stringify([...tiles, tile, ledge, hill], null, 2));
  const sceneFile = join(dir, 'scenes', 'crossroads', 'scene.json');
  const scene = JSON.parse(await readFile(sceneFile, 'utf8')) as object;
  await writeFile(sceneFile, JSON.stringify({ ...scene, view: '3d' }, null, 2));
}

test.use({ serverOptions: { prepare: addModelTile } });

test('a model tile stands its model in the 3D view, repeated across the tile', async ({ page }) => {
  await atTable(page, GM);
  await expect(page.getByTestId('view3d')).toHaveAttribute('data-models', '2', { timeout: 30_000 });
  await expect(page.getByTestId('view3d')).toHaveAttribute('data-solids', '1');
  await expect(page.getByTestId('view3d')).toHaveAttribute('data-terrain', '1');
});
