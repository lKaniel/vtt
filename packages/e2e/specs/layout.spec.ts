// The table's fixed parts (top bar, fight controls, party, map tools, side
// panel) each keep their own place: on a laptop screen and on a small one,
// out of a fight and in one, none of them lies over another.

import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.ts';
import { screenOf } from '../support/map.ts';
import { GM, atTable } from '../support/table.ts';

interface Box {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const PARTS = {
  'top bar': 'header.topbar',
  'fight controls': '.turn-order',
  party: '.party',
  'map tools': '.map-tools',
  'side panel': 'aside.chat',
};

/** The boxes of the parts on screen now. */
function boxes(page: Page): Promise<Box[]> {
  return page.evaluate((parts) => {
    return Object.entries(parts).flatMap(([name, selector]) => {
      const el = document.querySelector(selector);
      if (!el) return [];
      const r = el.getBoundingClientRect();
      return [{ name, x: r.x, y: r.y, width: r.width, height: r.height }];
    });
  }, PARTS);
}

const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;

/** Each pair of parts that lie over each other, by name. */
async function overlaps(page: Page): Promise<string[]> {
  const all = await boxes(page);
  return all.flatMap((a, i) =>
    all
      .slice(i + 1)
      .filter((b) => overlap(a, b))
      .map((b) => `${a.name} / ${b.name}`),
  );
}

for (const viewport of [
  { width: 1024, height: 640 },
  { width: 1366, height: 768 },
]) {
  test(`at ${viewport.width}x${viewport.height} the GM's panels do not overlap, in a fight or out`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await atTable(page, GM);
    await expect(page.getByRole('button', { name: 'Start combat' })).toBeVisible();
    expect(await overlaps(page)).toEqual([]);

    await page.getByRole('button', { name: 'Start combat' }).click();
    await expect(page.getByRole('button', { name: 'End combat' })).toBeVisible();
    expect(await overlaps(page)).toEqual([]);
  });
}

test("the GM's fog and daylight tools stay folded until asked for", async ({ page }) => {
  await atTable(page, GM);
  await expect(page.getByRole('toolbar', { name: 'Editor mode' })).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Fog of war' })).toHaveCount(0);
  // The fog button ends the row of modes rather than taking a row of its own.
  const modes = page.getByRole('toolbar', { name: 'Editor mode' });
  const first = (await modes.getByRole('button', { name: 'Tokens' }).boundingBox())!;
  const fog = (await modes.getByRole('button', { name: 'Fog and daylight' }).boundingBox())!;
  expect(fog.y).toBe(first.y);
  await page.getByRole('button', { name: 'Fog and daylight' }).click();
  await expect(page.getByRole('toolbar', { name: 'Fog of war' })).toBeVisible();
  await expect(page.getByText('Night', { exact: true })).toBeVisible();
});

test('selecting a creature opens no inspector; its HUD sets the colour filter', async ({ page }) => {
  await atTable(page, GM);
  const bram = await screenOf(page, 650, 650);
  await page.mouse.click(bram.x, bram.y);
  await expect.poll(() => page.evaluate(() => vtt.selected()?.id)).toBe('bram');
  await expect(page.getByLabel('Inspector')).toHaveCount(0);

  await page.mouse.click(bram.x, bram.y, { button: 'right' });
  await page.getByText('Token HUD').click();
  const hud = page.getByRole('dialog', { name: 'Bram HUD' });
  await hud.getByRole('combobox', { name: 'Colour filter' }).click();
  await page.getByRole('option', { name: 'sepia' }).click();
  await expect
    .poll(() => page.evaluate(() => (vtt.token('bram') as { filter?: string } | undefined)?.filter))
    .toBe('sepia');
});
