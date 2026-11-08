// The map in 3D (view3d/View3D.ts): a 3D scene shows in 3D for everyone,
// with a camera like BG3's that follows your creature, and the ground still
// takes the clicks and hovers of the flat map. A flat scene never shows in
// 3D; the GM makes a scene 3D in its settings and alone may lay it flat.
// One browser draws 3D per test: two software WebGL views starve each other.

import type { Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '../support/fixtures.ts';
import { GM, PLAYER_2, atTable } from '../support/table.ts';

/** Bram's spot on the crossroads (world/scenes/crossroads/tokens.json). */
const BRAM: [number, number] = [650, 650];

test.describe.configure({ timeout: 240_000 });

/** Starts collecting the walks the map previews (the `walkPreview` hook). */
async function watchPreviews(page: Page): Promise<() => Promise<{ token: string; to: [number, number] } | undefined>> {
  await page.evaluate(() => {
    const seen: unknown[] = [];
    window.seen = seen;
    vtt.hooks.on('walkPreview', (shown) => seen.push(shown));
  });
  return () => page.evaluate(() => window.seen?.at(-1) as { token: string; to: [number, number] } | undefined);
}

test.describe('on a 3D scene', () => {
  /** The crossroads is a 3D scene. */
  async function make3d(dir: string): Promise<void> {
    const file = join(dir, 'scenes', 'crossroads', 'scene.json');
    const scene = JSON.parse(await readFile(file, 'utf8')) as object;
    await writeFile(file, JSON.stringify({ ...scene, view: '3d' }, null, 2));
  }
  test.use({ serverOptions: { prepare: make3d } });

  test('a player sees it in 3D; the camera follows their creature and the ground still walks', async ({ page }) => {
    await atTable(page, PLAYER_2);
    const view = page.getByTestId('view3d');
    await expect(view.locator('canvas')).toBeVisible();
    await expect(page.locator('.map > canvas').first()).toBeHidden();
    // The flat map under the 3D floor keeps its empty ground see-through, so its canvas has alpha.
    const alpha = () =>
      page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>('.map > canvas')!;
        return canvas.getContext('webgl2')?.getContextAttributes()?.alpha;
      });
    expect(await alpha()).toBe(true);
    // Only the GM can lay it flat.
    await expect(page.getByRole('button', { name: /flat/ })).toHaveCount(0);

    await page.getByRole('button', { name: /^Bram \d/ }).click();
    await expect.poll(() => page.evaluate(() => vtt.selected()?.id)).toBe('bram');
    // The camera stands south of Bram looking north: above the middle of the view is the ground north of him.
    const last = await watchPreviews(page);
    const box = (await view.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.38, { steps: 3 });
    await expect.poll(async () => (await last())?.token, { timeout: 15_000 }).toBe('bram');
    const to = (await last())!.to;
    expect(to[1]).toBeLessThan(BRAM[1]);
    expect(Math.abs(to[0] - BRAM[0])).toBeLessThan(150);
    // The walk's length shows over the 3D view, beside where it ends.
    await expect(page.getByTestId('walk-label')).toContainText('ft');
  });

  test('a player picks low 3D graphics for a weak computer; the view starts again with them', async ({ page }) => {
    await atTable(page, PLAYER_2);
    const view = page.getByTestId('view3d');
    await expect(view.locator('canvas')).toBeVisible();
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('radio', { name: 'Low', exact: true }).click();
    await expect(view).toHaveAttribute('data-quality', 'low');
    await expect(view.locator('canvas')).toBeVisible();
    // Kept in this browser.
    await page.reload();
    await expect(page.getByTestId('view3d')).toHaveAttribute('data-quality', 'low', { timeout: 60_000 });
  });
});

test('the GM makes a flat scene 3D in its settings, lays it flat to edit it and stands it up again', async ({
  page,
}) => {
  await atTable(page, GM);
  const view = page.getByTestId('view3d');
  // A flat scene has no 3D view and no button for one.
  await expect(page.locator('.map > canvas').first()).toBeVisible();
  await expect(view).toHaveCount(0);
  await expect(page.getByRole('button', { name: /3D/ })).toHaveCount(0);

  await page.getByRole('tab', { name: 'Scenes' }).click();
  await page.getByRole('listitem').filter({ hasText: 'crossroads' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Settings…' }).click();
  const settings = page.getByRole('dialog');
  await settings.getByRole('combobox', { name: 'Scene', exact: true }).click();
  await page.getByRole('option', { name: /3D scene/ }).click();
  await settings.getByRole('button', { name: 'Close' }).click();
  await expect(view.locator('canvas')).toBeVisible();

  await page.getByRole('button', { name: 'Lay the 3D scene flat to edit it' }).click();
  await expect(view).toHaveCount(0);
  await expect(page.locator('.map > canvas').first()).toBeVisible();
  await page.getByRole('button', { name: 'Back to the 3D view' }).click();
  await expect(view.locator('canvas')).toBeVisible();
});
