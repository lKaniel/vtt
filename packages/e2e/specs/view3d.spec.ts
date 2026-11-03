// The map in 3D (view3d/View3D.ts): the top bar's button stands the map up
// with a camera like BG3's that follows your creature, and the ground still
// takes the clicks and hovers of the flat map.

import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.ts';
import { screenOf } from '../support/map.ts';
import { PLAYER_2, atTable } from '../support/table.ts';

/** Bram's spot on the crossroads (world/scenes/crossroads/tokens.json). */
const BRAM: [number, number] = [650, 650];

test.describe.configure({ timeout: 150_000 });

/** Starts collecting the walks the map previews (the `walkPreview` hook). */
async function watchPreviews(page: Page): Promise<() => Promise<{ token: string; to: [number, number] } | undefined>> {
  await page.evaluate(() => {
    const seen: unknown[] = [];
    window.seen = seen;
    vtt.hooks.on('walkPreview', (shown) => seen.push(shown));
  });
  return () => page.evaluate(() => window.seen?.at(-1) as { token: string; to: [number, number] } | undefined);
}

test('the 3D view follows your creature and the ground under the pointer still walks', async ({ page }) => {
  await atTable(page, PLAYER_2);
  const bram = await screenOf(page, ...BRAM);
  await page.mouse.click(bram.x, bram.y);
  await expect.poll(() => page.evaluate(() => vtt.selected()?.id)).toBe('bram');

  await page.getByRole('button', { name: '3D view' }).click();
  const view = page.getByTestId('view3d');
  await expect(view.locator('canvas')).toBeVisible();
  await expect(page.locator('.map > canvas').first()).toBeHidden();

  // The camera stands south of Bram looking north: above the middle of the view is the ground north of him.
  const last = await watchPreviews(page);
  const box = (await view.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.38, { steps: 3 });
  await expect.poll(async () => (await last())?.token, { timeout: 15_000 }).toBe('bram');
  const to = (await last())!.to;
  expect(to[1]).toBeLessThan(BRAM[1]);
  expect(Math.abs(to[0] - BRAM[0])).toBeLessThan(150);

  await page.getByRole('button', { name: 'Back to the 2D map' }).click();
  await expect(view).toHaveCount(0);
  await expect(page.locator('.map > canvas').first()).toBeVisible();
});
