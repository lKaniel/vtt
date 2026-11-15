// A combined scene (shared/scene-parts.ts): the GM makes a scene, lays two
// other scenes on it as parts, moves one, and goes to a part to edit it.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.ts';
import { GM, atTable } from '../support/table.ts';

const partsOf = (page: Page) => page.evaluate(() => vtt.doc('scenes', 'new-scene')?.parts);

test('the GM lays two scenes on a new one as its parts', async ({ page }) => {
  test.slow(); // a dialog and two pickers
  await atTable(page, GM);
  await page.getByRole('tab', { name: 'Scenes' }).click();
  await page.getByRole('button', { name: 'New scene' }).click();
  const settings = page.getByRole('dialog');
  await settings.getByRole('textbox', { name: 'Name', exact: true }).fill('City');
  await settings.getByRole('tab', { name: 'Parts' }).click();

  await settings.getByRole('combobox', { name: 'Add a part' }).click();
  await page.getByRole('option', { name: 'The Mill Road' }).click();
  await expect.poll(() => partsOf(page)).toEqual([{ scene: 'mill-road', x: 0, y: 0 }]);
  await settings.getByRole('combobox', { name: 'Add a part' }).click();
  await expect(page.getByRole('option', { name: 'The Mill Road' })).toHaveCount(0);
  await page.getByRole('option', { name: 'Crossroads' }).click();

  // Parts are placed in squares.
  const crossroads = settings.getByRole('listitem', { name: 'Crossroads' });
  await crossroads.getByRole('spinbutton', { name: 'Squares across' }).fill('40');
  await crossroads.getByRole('spinbutton', { name: 'Squares down' }).fill('-5');
  await crossroads.getByRole('spinbutton', { name: 'Squares down' }).blur();
  await expect
    .poll(() => partsOf(page))
    .toEqual([
      { scene: 'mill-road', x: 0, y: 0 },
      { scene: 'crossroads', x: 4000, y: -500 },
    ]);
  await page.screenshot({ path: test.info().outputPath('1-parts.png') });

  await settings.getByRole('listitem', { name: 'The Mill Road' }).getByRole('button', { name: 'Remove' }).click();
  await expect.poll(() => partsOf(page)).toEqual([{ scene: 'crossroads', x: 4000, y: -500 }]);

  // Edit takes the GM to the part itself.
  await crossroads.getByRole('button', { name: 'Edit' }).click();
  await expect.poll(() => page.evaluate(() => vtt.tokens().length)).toBeGreaterThan(0);
});

test.describe('a city of two quarters', () => {
  /** A scene "City": the crossroads, and the mill road 60 squares to the east. */
  async function addCity(dir: string): Promise<void> {
    const parts = [
      { scene: 'crossroads', x: 0, y: 0 },
      { scene: 'mill-road', x: 6000, y: 0 },
    ];
    await mkdir(join(dir, 'scenes', 'city'), { recursive: true });
    await writeFile(join(dir, 'scenes', 'city', 'scene.json'), JSON.stringify({ name: 'City', gridSize: 100, parts }));
  }

  test.use({ serverOptions: { prepare: addCity } });

  const bakeOf = (page: Page, id: string) => page.evaluate((s) => vtt.doc('scenes', s)?.bake, id);

  test('Optimise bakes each part, and the city draws their pictures', async ({ page }) => {
    test.slow(); // two scenes drawn into pictures
    await atTable(page, GM);
    await page.getByRole('tab', { name: 'Scenes' }).click();
    await page.getByRole('listitem').filter({ hasText: 'City' }).click();
    await expect(page.getByRole('button', { name: 'Optimise', exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('1-city-edit.png') });

    const shown = page.waitForResponse((r) => /\/baked\/crossroads\/.+\.(webp|png)$/.test(r.url()), {
      timeout: 90_000,
    });
    await page.getByRole('button', { name: 'Optimise', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible({ timeout: 90_000 });
    await shown;
    expect(await bakeOf(page, 'crossroads')).toBeTruthy();
    expect(await bakeOf(page, 'mill-road')).toBeTruthy();
    expect(await bakeOf(page, 'city')).toBeUndefined();
    await page.screenshot({ path: test.info().outputPath('2-city-optimised.png') });
  });
});
