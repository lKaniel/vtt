// The table's fixed parts (top bar, fight controls, party, map tools, side
// panel) each keep their own place: on a laptop screen and on a small one,
// out of a fight and in one, none of them lies over another.

import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.ts';
import { screenOf } from '../support/map.ts';
import { GM, PLAYER_2, atTable } from '../support/table.ts';

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
  'action bar': '.actionbar-wrap',
};

/** The boxes of the parts on screen now. */
function boxes(page: Page, parts: Record<string, string>): Promise<Box[]> {
  return page.evaluate((parts) => {
    return Object.entries(parts).flatMap(([name, selector]) => {
      const el = document.querySelector(selector);
      if (!el) return [];
      const r = el.getBoundingClientRect();
      return [{ name, x: r.x, y: r.y, width: r.width, height: r.height }];
    });
  }, parts);
}

const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;

/** Each pair of parts that lie over each other, by name. */
async function overlaps(page: Page, parts: Record<string, string> = PARTS): Promise<string[]> {
  const all = await boxes(page, parts);
  return all.flatMap((a, i) =>
    all
      .slice(i + 1)
      .filter((b) => overlap(a, b))
      .map((b) => `${a.name} / ${b.name}`),
  );
}

// On a small screen the action bar may sit over the side panel's foot; from a laptop up it keeps clear.
const { 'action bar': _bar, ...FRAME } = PARTS;

for (const { viewport, parts } of [
  { viewport: { width: 1024, height: 640 }, parts: FRAME },
  { viewport: { width: 1366, height: 768 }, parts: PARTS },
]) {
  test(`at ${viewport.width}x${viewport.height} the GM's panels do not overlap, in a fight or out`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await atTable(page, GM);
    await expect(page.getByRole('button', { name: 'Start combat' })).toBeVisible();
    expect(await overlaps(page, parts)).toEqual([]);

    await page.getByRole('button', { name: 'Start combat' }).click();
    await expect(page.getByRole('button', { name: 'End combat' })).toBeVisible();
    expect(await overlaps(page, parts)).toEqual([]);
    // Portraits that share art are told apart by their names.
    await expect(page.locator('.turn-order .turn-name', { hasText: 'Bram' })).toBeVisible();
  });
}

test("the GM's fog and daylight tools stay folded until asked for", async ({ page }) => {
  await atTable(page, GM);
  await expect(page.getByRole('toolbar', { name: 'Editor mode' })).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Fog of war' })).toHaveCount(0);
  // The fog button ends the rail of modes rather than standing apart.
  const modes = page.getByRole('toolbar', { name: 'Editor mode' });
  const first = (await modes.getByRole('button', { name: 'Tokens' }).boundingBox())!;
  const fog = (await modes.getByRole('button', { name: 'Fog and daylight' }).boundingBox())!;
  expect(fog.x).toBe(first.x);
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

test('the main menu and the join screen sit in the middle of the screen', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  const game = page.getByRole('button', { name: /Example: the crossroads/ });
  await expect(game).toBeVisible();
  const centre = (box: { x: number; width: number } | null) => (box ? box.x + box.width / 2 : 0);
  expect(Math.abs(centre(await game.boundingBox()) - 800)).toBeLessThan(20);

  await game.click();
  const back = page.getByRole('button', { name: 'Back to the games' });
  expect(Math.abs(centre(await back.boundingBox()) - 800)).toBeLessThan(20);
});

test("the compendium's search box is one line high", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await atTable(page, GM);
  await page.getByRole('tab', { name: 'Compendium' }).click();
  const search = page.getByRole('searchbox', { name: /Search/ });
  await expect(search).toBeVisible();
  const box = (await search.locator('..').boundingBox())!;
  expect(box.height).toBeLessThan(40);
});

test('the right-click menu sets Delete apart from the rest', async ({ page }) => {
  await atTable(page, GM);
  const bram = await screenOf(page, 650, 650);
  await page.mouse.click(bram.x, bram.y, { button: 'right' });
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: 'Delete' })).toBeVisible();
  await expect(menu.getByRole('separator')).toHaveCount(1);
});

test("on a laptop screen a player's action bar leaves room for the map, the side panel and the map tools", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await atTable(page, PLAYER_2);
  await expect.poll(() => page.evaluate(() => vtt.selected()?.id)).toBe('bram');
  await expect(page.locator('.actionbar-wrap')).toBeVisible();
  expect(await overlaps(page)).toEqual([]);
  const bar = (await page.locator('.actionbar-wrap').boundingBox())!;
  expect(bar.height).toBeLessThan(768 * 0.4);
});

test.describe('the compact action bar', () => {
  test.use({ barSize: 'compact' });

  test('on a small screen it shows one row of tiles, pages through the rest and grows back to the full bar', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 640 });
    await atTable(page, PLAYER_2);
    await expect.poll(() => page.evaluate(() => vtt.selected()?.id)).toBe('bram');
    const bar = page.locator('.actionbar-wrap');
    await expect(bar).toBeVisible();
    // Clear of the side panel and the map tools, and no taller than a fifth of the screen.
    expect(await overlaps(page)).toEqual([]);
    expect((await bar.boundingBox())!.height).toBeLessThan(640 * 0.2);
    await expect(page.locator('.ab-grid > *')).toHaveCount(10);
    // The how-to line no longer floats over the map once a character is selected.
    await expect(page.locator('.hint')).toHaveCount(0);

    await expect(page.getByLabel('Row 1 of 3')).toBeVisible();
    await page.getByRole('button', { name: 'Next row' }).click();
    await expect(page.getByLabel('Row 2 of 3')).toBeVisible();
    await page.getByRole('button', { name: 'Previous row' }).click();
    await page.getByRole('button', { name: 'Previous row' }).click();
    await expect(page.getByLabel('Row 3 of 3')).toBeVisible();

    await page.getByRole('button', { name: /^Full action bar/ }).click();
    await expect(page.locator('.ab-grid > *')).toHaveCount(30);
    expect(await page.evaluate(() => localStorage.getItem('vtt.actionBar'))).toBe('full');
  });
});
