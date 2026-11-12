// Endless ground, as Baileywiki's Unlimited Terrain: a tileable picture
// repeated across a tile, cut to the tile's own shape, that the GM sizes,
// turns and shuffles from the inspector and the tile's menu.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { join } from 'node:path';
import { expect, test } from '../support/fixtures.ts';
import { screenOf } from '../support/map.ts';
import { GM, atTable } from '../support/table.ts';

const CHECKS =
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#e8d9a0"/><rect width="32" height="32" fill="#8a5a2a"/><rect x="32" y="32" width="32" height="32" fill="#8a5a2a"/></svg>';
const BLOB =
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="48" fill="#000"/></svg>';

async function withTerrain(dir: string): Promise<void> {
  await mkdir(join(dir, 'assets/terrain'), { recursive: true });
  await writeFile(join(dir, 'assets/terrain/checks.svg'), CHECKS);
  await writeFile(join(dir, 'assets/terrain/blob.svg'), BLOB);
  const file = join(dir, 'scenes/crossroads/tiles.json');
  const tiles = JSON.parse(await readFile(file, 'utf8')) as object[];
  const ground = { kind: 'image', y: 1200, w: 400, h: 400, locked: false };
  await writeFile(
    file,
    JSON.stringify([
      ...tiles,
      { ...ground, id: 'checks', x: 500, src: '/assets/terrain/checks.svg', repeat: { scale: 2 } },
      {
        ...ground,
        id: 'patch',
        x: 1100,
        src: '/assets/terrain/blob.svg',
        repeat: { src: '/assets/terrain/checks.svg', rotation: 45 },
      },
    ]),
  );
}

test.use({ serverOptions: { prepare: withTerrain } });

const repeatOf = (page: Page, id: string) =>
  page.evaluate((id) => vtt.doc('crossroads/tiles', id)?.repeat as Record<string, unknown> | undefined, id);

test('the GM turns a repeating ground tile and shuffles its pattern', async ({ page }) => {
  test.slow();
  await atTable(page, GM);
  await page.getByRole('button', { name: 'Tiles' }).click();
  const at = await screenOf(page, 1300, 1400);
  await page.mouse.click(at.x, at.y);
  const inspector = page.getByLabel('Inspector');
  const turn = inspector.getByRole('spinbutton', { name: 'Pattern turn (degrees)' });
  await expect(turn).toHaveValue('45');
  await turn.fill('90');
  await turn.press('Enter');
  await expect.poll(() => repeatOf(page, 'patch')).toMatchObject({ rotation: 90 });

  await page.mouse.click(at.x, at.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Shuffle the pattern' }).click();
  await expect
    .poll(async () => {
      const r = await repeatOf(page, 'patch');
      return r && typeof r.scale === 'number' && r.src === '/assets/terrain/checks.svg';
    })
    .toBe(true);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
});
