// Building a scene by hand: a new scene the GM goes to at once, its floors
// made in the settings, a tile drawn on the floor picked in the map tools,
// and the floor taken away again with the tile then on every floor.

import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.ts';
import { dragOnMap } from '../support/map.ts';
import { GM, atTable } from '../support/table.ts';

const levelsOf = (page: Page) =>
  page.evaluate(() => (vtt.doc('scenes', 'new-scene')?.levels as { id: string }[] | undefined)?.map((l) => l.id));

test('the GM makes a scene with two floors and draws a tile on the upper one', async ({ page }) => {
  test.slow(); // a dialog, menus and a drag on the map
  await atTable(page, GM);
  await page.getByRole('tab', { name: 'Scenes' }).click();
  await page.getByRole('button', { name: 'New scene' }).click();
  const settings = page.getByRole('dialog');
  await settings.getByRole('textbox', { name: 'Name', exact: true }).fill('Tower');
  await settings.getByRole('tab', { name: 'Floors' }).click();
  await settings.getByRole('button', { name: 'Add floors' }).click();
  await settings.getByRole('button', { name: 'Add a floor on top' }).click();
  await expect.poll(() => levelsOf(page)).toEqual(['ground', 'floor-2']);
  await settings.getByRole('button', { name: 'Close' }).click();

  // The GM is on the new scene already (the tile lands there), and picks the upper floor to build.
  await page.getByRole('combobox', { name: 'Level' }).click();
  await page.getByRole('option', { name: 'Floor 2' }).click();
  await page.getByRole('button', { name: 'Tiles' }).click();
  await page.getByRole('toolbar', { name: 'Tool' }).getByRole('button', { name: 'Draw' }).click();
  await dragOnMap(page, [900, 800], [1100, 1000]);
  await expect.poll(() => page.evaluate(() => vtt.docs('new-scene/tiles').map((t) => t.level))).toEqual(['floor-2']);
  await expect(page.getByLabel('Inspector').getByRole('combobox', { name: 'Level' })).toContainText('Floor 2');

  // Taking the floor away leaves the tile on every floor.
  await page.getByRole('tab', { name: 'Scenes' }).click();
  await page.getByRole('listitem').filter({ hasText: 'Tower' }).dblclick();
  await settings.getByRole('tab', { name: 'Floors' }).click();
  await settings.getByRole('button', { name: 'Remove Floor 2' }).click();
  await expect.poll(() => levelsOf(page)).toEqual(['ground']);
  await expect.poll(() => page.evaluate(() => vtt.docs('new-scene/tiles').map((t) => t.level))).toEqual([undefined]);
});
