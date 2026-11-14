// Disguises: a player gives their character another look (an uploaded
// picture and the name others know them by) and wears it; another player
// sees only the disguise, the owner sees both.

import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.ts';
import { screenOf } from '../support/map.ts';
import { PLAYER_1, PLAYER_2, atTable } from '../support/table.ts';

const BRAM: [number, number] = [650, 650];
/** A one-pixel picture to upload. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function openBram(page: Page) {
  const p = await screenOf(page, ...BRAM);
  await page.mouse.click(p.x, p.y);
  await page.keyboard.press('c');
  const sheet = page.getByRole('region', { name: "Bram's character sheet" });
  await expect(sheet).toBeVisible();
  return sheet;
}

const bramSeen = (page: Page) =>
  page.evaluate(() => {
    const t = vtt.token('bram');
    return t && { name: t.name, img: t.img, look: t.look };
  });

test('a player wears a disguise that others see instead of them', async ({ page, browser, server }) => {
  await atTable(page, PLAYER_2);
  const sheet = await openBram(page);
  await sheet.getByRole('switch', { name: 'Edit mode (E)' }).click();
  await sheet.getByRole('tab', { name: 'Token' }).click();
  await sheet.getByRole('button', { name: 'Add a look' }).click();
  const row = sheet.locator('[data-slot="look-row"]');
  await row.getByRole('textbox', { name: 'Look name' }).fill('Merchant');
  await row.getByRole('textbox', { name: 'Name others see' }).fill('Old Tobin');
  await row.getByLabel('Upload a picture').setInputFiles({ name: 'tobin.png', mimeType: 'image/png', buffer: PNG });
  await expect(row.getByRole('textbox', { name: 'Picture of Merchant' })).toHaveValue('/assets/uploads/tobin.png');
  await sheet.getByRole('combobox', { name: 'Wearing' }).click();
  await page.getByRole('option', { name: 'Merchant' }).click();
  await expect.poll(async () => (await bramSeen(page))?.look).toBe('look-1');

  const other = await (await browser.newContext({ baseURL: server.url })).newPage();
  await atTable(other, PLAYER_1);
  await expect
    .poll(() => bramSeen(other))
    .toEqual({ name: 'Old Tobin', img: '/assets/uploads/tobin.png', look: undefined });
  // The owner still knows who it is.
  expect((await bramSeen(page))?.name).toBe('Bram');

  await sheet.getByRole('combobox', { name: 'Wearing' }).click();
  await page.getByRole('option', { name: 'Own look' }).click();
  await expect.poll(async () => (await bramSeen(other))?.name).toBe('Bram');
  await other.context().close();
});
