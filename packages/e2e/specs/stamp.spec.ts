// The stamp brush (docs/editor.md, "Tiles"): the GM opens a folder in the
// Assets tab, picks a picture up, stamps it with a click and scatters more
// with a drag, then stamps a 3D model, which stands at its real size with
// its picture from above on the flat map.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.ts';
import { dragOnMap, screenOf } from '../support/map.ts';
import { WEDGE } from '../support/models.ts';
import { GM, atTable } from '../support/table.ts';

test.describe.configure({ timeout: 150_000 });

const BARREL =
  '<svg xmlns="http://www.w3.org/2000/svg" width="50" height="100"><rect width="50" height="100" fill="#7a4a1a"/></svg>';

async function addProps(dir: string): Promise<void> {
  await mkdir(join(dir, 'assets', 'props'), { recursive: true });
  await writeFile(join(dir, 'assets', 'props', 'barrel.svg'), BARREL);
  await writeFile(join(dir, 'assets', 'props', 'cart.gltf'), JSON.stringify(WEDGE));
}

test.use({ serverOptions: { prepare: addProps } });

const stamped = (page: Page, src: string) =>
  page.evaluate(
    (file) =>
      vtt
        .docs('crossroads/tiles')
        .filter((t) => t.src === file || (t.model as { src?: string } | undefined)?.src === file),
    src,
  );

async function clickOnMap(page: Page, x: number, y: number): Promise<void> {
  const at = await screenOf(page, x, y);
  await page.mouse.click(at.x, at.y);
}

test('the GM stamps and scatters a picture, then a 3D model at its real size', async ({ page }) => {
  test.slow(); // the canvas, a model drawn in software, a drag
  await atTable(page, GM);
  await page.getByRole('tab', { name: 'Assets' }).click();
  await page.getByRole('button', { name: 'Open This game' }).click();
  await page.getByRole('button', { name: 'Open props' }).click();

  await page.getByRole('listitem', { name: 'barrel' }).click();
  await expect(page.getByRole('toolbar', { name: 'Tool' }).getByRole('button', { name: 'Stamp' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('group', { name: 'Stamp' })).toContainText('barrel');
  // A click stamps one on half squares, as big as it is drawn for 100 px squares.
  await clickOnMap(page, 1110, 1040);
  await expect
    .poll(() => stamped(page, '/assets/props/barrel.svg'))
    .toEqual([expect.objectContaining({ x: 1075, y: 1000, w: 50, h: 100 })]);
  // A drag scatters one every width (Spacing ×1: 100 px, the longer side) along the way.
  await dragOnMap(page, [800, 700], [1100, 700]);
  await expect.poll(async () => (await stamped(page, '/assets/props/barrel.svg')).length).toBe(5);
  await expect(page.getByLabel('Inspector')).toHaveCount(0);

  // A model, measured when picked up: 2 × 3 units is 200 × 300 px, 5 ft tall.
  await page.getByRole('listitem', { name: 'cart' }).click();
  await expect(page.getByRole('group', { name: 'Stamp' })).not.toContainText('Measuring');
  await page.keyboard.press('e');
  await clickOnMap(page, 1300, 1100);
  await expect
    .poll(() => stamped(page, '/assets/props/cart.gltf'))
    .toEqual([
      expect.objectContaining({
        w: 200,
        h: 300,
        rotation: 15,
        model: { src: '/assets/props/cart.gltf', height: 5, rotation: 15 },
      }),
    ]);
  // Its picture on the flat map is the model from above, saved in the game.
  await expect
    .poll(async () => (await stamped(page, '/assets/props/cart.gltf'))[0]?.src)
    .toMatch(/^\/assets\/uploads\/plan-cart-/);

  // What was stamped lately is a click away, and Esc puts the brush down.
  await expect(page.getByRole('list', { name: 'Stamped lately' }).getByRole('listitem')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('toolbar', { name: 'Tool' }).getByRole('button', { name: 'Select' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
