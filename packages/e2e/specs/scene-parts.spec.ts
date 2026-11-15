// A combined scene (shared/scene-parts.ts): the GM makes a scene, lays two
// other scenes on it as parts, moves one, and goes to a part to edit it.

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
