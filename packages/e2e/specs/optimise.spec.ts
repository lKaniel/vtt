// The GM's Optimise on a 2D scene (session-bake.ts): the still tiles are
// drawn into one picture per floor, cut into a pyramid of blocks saved in
// the game's assets, and the map shows those instead; Edit goes back to
// every tile drawn. The roofs get a picture of their own, which fades as one.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.ts';
import { GM, atTable } from '../support/table.ts';

/** A roof over the crossroads' inn, for the roof picture. */
async function addRoof(dir: string): Promise<void> {
  const file = join(dir, 'scenes', 'crossroads', 'tiles.json');
  const tiles = JSON.parse(await readFile(file, 'utf8')) as object[];
  const roof = {
    id: 'inn-roof',
    kind: 'image',
    src: '/assets/tokens/bram.webp',
    x: 400,
    y: 200,
    w: 500,
    h: 600,
    overhead: true,
  };
  await writeFile(file, JSON.stringify([...tiles, roof], null, 2));
}

test.use({ serverOptions: { prepare: addRoof } });

const scene = (page: Page) =>
  page.evaluate(() => vtt.docs('scenes').find((d) => d.id === 'crossroads') as { bake?: string; optimised?: boolean });

test('the GM optimises a scene into pictures, and goes back to edit it', async ({ page, server }) => {
  await atTable(page, GM);
  await page.screenshot({ path: test.info().outputPath('1-edit.png') });
  // The map loads the blocks it shows (the bake itself only sends them).
  const shown = page.waitForResponse((r) => /\/baked\/crossroads\/.+\.(webp|png)$/.test(r.url()), { timeout: 60_000 });
  await page.getByRole('button', { name: 'Optimise', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible({ timeout: 60_000 });
  expect((await shown).ok()).toBe(true);

  const { bake, optimised } = await scene(page);
  expect(optimised).toBe(true);
  const folder = join(server.gameDir, 'assets', 'baked', 'crossroads', bake!);
  const manifest = JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8')) as {
    groups: { roof?: boolean; tiles: Record<string, string>; blocks: string[][] }[];
  };
  const baked = Object.keys(manifest.groups[0]!.tiles);
  expect(baked.length).toBeGreaterThan(5);
  expect(baked).not.toContain('inn-roof');
  expect(manifest.groups[0]!.blocks[0]!.length).toBeGreaterThan(0);
  expect((await readdir(join(folder, '0'))).length).toBeGreaterThan(0);
  const roofs = manifest.groups.find((g) => g.roof)!;
  expect(Object.keys(roofs.tiles)).toEqual(['inn-roof']);
  expect((await readdir(join(folder, String(manifest.groups.indexOf(roofs))))).length).toBeGreaterThan(0);
  // The roof picture hides the party; the GM's pointer on a roof lifts every roof in it.
  await page.mouse.move(300, 450);
  const roofed = await page.screenshot({ path: test.info().outputPath('2-optimised.png') });
  await page.mouse.move(302, 165);
  await expect.poll(async () => (await page.screenshot()).equals(roofed)).toBe(false);
  await page.screenshot({ path: test.info().outputPath('3-roofs-lifted.png') });

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Optimise', exact: true })).toBeVisible();
  expect((await scene(page)).optimised).toBeUndefined();
});
