// The Baileywiki library in the GM's Assets tab: the prefabs and scenes of
// the `baileywiki` pack (as `pnpm import-baileywiki` writes it, with split
// compendia), found by tag, placed with a click or dragged onto the map.
// The pack here is a tiny stand-in written by the test.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { expect, test } from '../support/fixtures.ts';
import { screenOf } from '../support/map.ts';
import { GM, atTable } from '../support/table.ts';

const LAMP =
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="5" fill="gold"/></svg>';

const prefab = (id: string, name: string, tags: string[]) => ({
  id,
  name,
  tags,
  tiles: [{ id: `${id}-tile`, kind: 'image', x: 0, y: 0, w: 100, h: 100, src: 'pack://baileywiki/media/lamp.svg' }],
  lights: [{ id: `${id}-light`, x: 50, y: 50, bright: 10, dim: 20 }],
});

async function put(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, typeof data === 'string' ? data : JSON.stringify(data));
}

/** A `baileywiki` pack with one split prefab compendium, installed but off for the game. */
async function withBaileywikiPack(dir: string): Promise<void> {
  const pack = join(dirname(dir), 'data', 'packs', 'baileywiki');
  await put(join(pack, 'pack.json'), {
    id: 'baileywiki',
    name: 'Baileywiki',
    license: 'private',
    compendia: [
      {
        id: 'bw-prefabs-2d',
        name: 'Baileywiki 2D prefabs',
        type: 'prefab',
        path: 'compendia/bw-prefabs-2d',
        split: true,
      },
    ],
  });
  await put(join(pack, 'media/lamp.svg'), LAMP);
  const lamps = [
    prefab('street-lamp', 'Street Lamp', ['lighting', 'town']),
    prefab('camp-fire', 'Camp Fire', ['camp']),
  ];
  await put(
    join(pack, 'compendia/bw-prefabs-2d/index.json'),
    lamps.map((p) => ({ id: p.id, name: p.name, tags: p.tags, thumb: 'pack://baileywiki/media/lamp.svg' })),
  );
  for (const p of lamps) await put(join(pack, `compendia/bw-prefabs-2d/${p.id}.json`), p);
}

test.use({ serverOptions: { prepare: withBaileywikiPack } });

const tilesOf = (dir: string) =>
  readFile(join(dir, 'scenes/crossroads/tiles.json'), 'utf8').then(
    (text) => text,
    () => '',
  );

test('the GM finds a Baileywiki prefab by tag and places it, its light with it', async ({ page, server }) => {
  await atTable(page, GM);
  await page.getByRole('tab', { name: 'Assets' }).click();
  await page.getByRole('button', { name: 'Baileywiki' }).click();
  await page.getByRole('button', { name: 'Turn the Baileywiki pack on' }).click();
  const library = page.getByRole('region', { name: 'Baileywiki library' });
  await expect(library.getByRole('button', { name: 'Camp Fire' })).toBeVisible();

  await library.getByRole('button', { name: 'town', exact: true }).click();
  await expect(library.getByRole('button', { name: 'Camp Fire' })).toBeHidden();
  await library.getByRole('button', { name: 'Street Lamp' }).click();
  await expect.poll(() => tilesOf(server.gameDir)).toContain('street-lamp-tile');
  const lights = await readFile(join(server.gameDir, 'scenes/crossroads/lights.json'), 'utf8');
  expect(lights).toContain('street-lamp-light');
});

test('the GM drags a Baileywiki prefab onto the map', async ({ page, server }) => {
  await atTable(page, GM);
  await page.getByRole('tab', { name: 'Assets' }).click();
  await page.getByRole('button', { name: 'Baileywiki' }).click();
  await page.getByRole('button', { name: 'Turn the Baileywiki pack on' }).click();
  const card = page.getByRole('region', { name: 'Baileywiki library' }).getByRole('button', { name: 'Camp Fire' });
  const to = await screenOf(page, 900, 900);
  const map = page.locator('.map canvas');
  const box = (await map.boundingBox())!;
  await card.dragTo(map, { targetPosition: { x: to.x - box.x, y: to.y - box.y } });
  await expect.poll(() => tilesOf(server.gameDir)).toContain('camp-fire-tile');
});
