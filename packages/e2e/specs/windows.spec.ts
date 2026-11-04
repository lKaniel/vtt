// Windows as in Foundry: a sheet or dialog is dragged by its title bar,
// rolled up to it and down again, and stays open when the table is
// clicked; the side panel runs down the whole right edge and folds into a
// strip of its tab icons.

import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.ts';
import { screenOf } from '../support/map.ts';
import { GM, PLAYER_2, atTable } from '../support/table.ts';

test.describe.configure({ timeout: 150_000 }); // drags at a few frames a second

const BRAM: [number, number] = [650, 650];

/** Drags `handle` by (dx, dy) with the mouse. */
async function drag(page: Page, handle: Locator, dx: number, dy: number) {
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 40 + dx, box.y + box.height / 2 + dy, { steps: 4 });
  await page.mouse.up();
}

test('a sheet moves by its title bar and rolls up to it', async ({ page }) => {
  await atTable(page, PLAYER_2);
  const p = await screenOf(page, ...BRAM);
  await page.mouse.click(p.x, p.y);
  await page.keyboard.press('c');
  const sheet = page.getByRole('region', { name: "Bram's character sheet" });
  await expect(sheet.getByRole('heading', { name: 'Bram' })).toBeVisible();

  const before = (await sheet.boundingBox())!;
  await drag(page, sheet.locator('[data-slot=window-header]'), -60, 50);
  await expect.poll(async () => (await sheet.boundingBox())!.y).toBeGreaterThan(before.y + 30);
  expect((await sheet.boundingBox())!.x).toBeLessThan(before.x - 30);

  await sheet.getByRole('button', { name: 'Roll up' }).click();
  await expect(sheet.getByRole('heading', { name: 'Bram' })).toHaveCount(0);
  await expect(sheet).toContainText('Bram'); // the title bar stays
  await sheet.getByRole('button', { name: 'Roll down' }).click();
  await expect(sheet.getByRole('heading', { name: 'Bram' })).toBeVisible();
});

test('a dialog floats over the table: dragged, rolled up, left open by a click on the map', async ({ page }) => {
  await atTable(page, GM);
  await page.getByRole('tab', { name: 'Scenes' }).click();
  await page.getByRole('button', { name: 'New scene' }).click();
  const settings = page.getByRole('dialog');
  await expect(settings.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible();

  const before = (await settings.boundingBox())!;
  await drag(page, settings.locator('[data-slot=dialog-title]'), 120, 40);
  await expect.poll(async () => (await settings.boundingBox())!.x).toBeGreaterThan(before.x + 80);

  await settings.getByRole('button', { name: 'Roll up' }).click();
  await expect(settings.getByRole('textbox', { name: 'Name', exact: true })).toBeHidden();
  await page.mouse.click(300, 500);
  await expect(settings).toBeVisible();
  await settings.getByRole('button', { name: 'Roll down' }).click();
  await expect(settings.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible();
  await settings.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(settings).toHaveCount(0);
});

test('the side panel runs the height of the screen and folds into its tab icons', async ({ page }) => {
  await atTable(page, GM);
  const panel = page.getByRole('complementary');
  const tall = (await panel.boundingBox())!;
  expect(tall.height).toBeGreaterThan(600);

  await page.getByRole('button', { name: 'Hide panel' }).click();
  await expect(panel.getByRole('textbox')).toHaveCount(0);
  expect((await panel.boundingBox())!.width).toBeLessThan(80);

  await panel.getByRole('tab', { name: 'Actors' }).click();
  await expect(
    panel.getByRole('searchbox', { name: /Search/ }).or(panel.getByPlaceholder(/Search actors/)),
  ).toBeVisible();
  expect((await panel.boundingBox())!.width).toBeGreaterThan(250);
});

test('several sheets stay open at once, and Esc closes the top one', async ({ page }) => {
  await atTable(page, GM);
  await page.getByRole('button', { name: /^Bram / }).click();
  await page.keyboard.press('c');
  // Bram's sheet covers the portraits on this small screen.
  await page.getByRole('button', { name: /^Orrin / }).dispatchEvent('click');
  await page.keyboard.press('c');
  const bram = page.getByRole('region', { name: "Bram's character sheet" });
  const orrin = page.getByRole('region', { name: "Orrin's character sheet" });
  await expect(bram).toBeVisible();
  await expect(orrin).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(orrin).toHaveCount(0);
  await expect(bram).toBeVisible();
});

test('a side panel tab opens in a window of its own, beside another tab', async ({ page }) => {
  await atTable(page, GM);
  await page.getByRole('button', { name: 'Open in a window' }).click();
  const log = page.getByRole('dialog', { name: 'Adventure log' });
  await expect(log.getByRole('textbox')).toBeVisible();
  await page.getByRole('complementary').getByRole('tab', { name: 'Actors' }).click();
  await expect(page.getByRole('complementary').getByPlaceholder(/Search actors/)).toBeVisible();
  await log.getByRole('textbox').fill('/r 1d20');
  await log.getByRole('textbox').press('Enter');
  await expect(log).toContainText('1d20');
  await log.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(log).toHaveCount(0);
});
