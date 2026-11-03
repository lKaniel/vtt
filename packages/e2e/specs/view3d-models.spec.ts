// 3D models in the 3D view (model3d.ts in shared): a tile with a glTF model
// stands it on the map; the 2D map draws nothing for it. A tile with a drawn
// solid (solid3d.ts) raises its outline.

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
  await writeFile(file, JSON.stringify([...tiles, tile, ledge], null, 2));
}

test.use({ serverOptions: { prepare: addModelTile } });

test('a model tile stands its model in the 3D view, repeated across the tile', async ({ page }) => {
  await atTable(page, GM);
  await page.getByRole('button', { name: '3D view' }).click();
  await expect(page.getByTestId('view3d')).toHaveAttribute('data-models', '2', { timeout: 30_000 });
  await expect(page.getByTestId('view3d')).toHaveAttribute('data-solids', '1');
});
