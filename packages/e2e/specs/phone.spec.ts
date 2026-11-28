// Playing on a phone: the map, your sheet and the log each take the whole
// screen, picked from the tabs along the bottom, and the action bar sits over
// the map. Nothing is wider than the screen.

import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.ts';
import { GM, PLAYER_1, PLAYER_2, atTable, chatLog, say } from '../support/table.ts';

const PHONE = { width: 390, height: 844 };

test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

const tab = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Phone tabs' }).getByRole('button', { name });

/** Whether the page can be scrolled sideways (something sticks out past the screen's edge). */
const scrollsSideways = (page: Page) => page.evaluate(() => document.scrollingElement!.scrollWidth > window.innerWidth);

async function insideScreen(page: Page, selector: string): Promise<void> {
  const box = (await page.locator(selector).first().boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(PHONE.height + 1);
}

test('the map shows the action bar and hides the side panel', async ({ page }) => {
  await atTable(page, PLAYER_1);
  await expect(tab(page, 'Map')).toHaveAttribute('aria-pressed', 'true');
  await expect(chatLog(page)).toBeHidden();
  await expect(page.locator('.actionbar')).toBeVisible();
  await insideScreen(page, '.actionbar-wrap');
  await insideScreen(page, 'header.topbar');
  expect(await scrollsSideways(page)).toBe(false);
});

test('the sheet tab opens your character over the whole screen, the map tab puts it away', async ({ page }) => {
  await atTable(page, PLAYER_1);
  await tab(page, 'Sheet').click();
  await expect(page.getByRole('region', { name: "Orrin's character sheet" })).toBeVisible();
  await expect(tab(page, 'Sheet')).toHaveAttribute('aria-pressed', 'true');
  await insideScreen(page, '[data-slot=window].sheet');
  const box = (await page.locator('[data-slot=window].sheet').boundingBox())!;
  expect(box.width).toBeGreaterThan(PHONE.width - 2);
  expect(await scrollsSideways(page)).toBe(false);
  await tab(page, 'Map').click();
  await expect(page.locator('[data-slot=window].sheet')).toHaveCount(0);
});

test('the log tab shows the side panel across the screen, and chat works there', async ({ page }) => {
  await atTable(page, PLAYER_1);
  await tab(page, 'Log').click();
  await expect(chatLog(page)).toBeVisible();
  await insideScreen(page, 'aside.chat');
  await say(page, 'Hello from a phone');
  await expect(chatLog(page)).toContainText('Hello from a phone');
  await tab(page, 'Map').click();
  await expect(chatLog(page)).toBeHidden();
});

test('in a fight the bar keeps end turn on the screen', async ({ page, seat }) => {
  test.slow();
  await atTable(page, PLAYER_2);
  const gm = await seat(GM);
  await gm.evaluate(() => vtt.send({ t: 'combatStart', tokens: ['bram', 'orrin'] }));
  const end = page.getByRole('button', { name: /^(End turn|Waiting for your turn)$/ });
  await expect(end).toBeVisible();
  await insideScreen(page, '.end-turn');
  expect(await scrollsSideways(page)).toBe(false);
});

test('settings can put the table layout back on a phone', async ({ page }) => {
  await atTable(page, PLAYER_1);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('radiogroup', { name: 'Screen layout' }).getByRole('radio', { name: 'Table' }).click();
  await expect(page.getByRole('navigation', { name: 'Phone tabs' })).toHaveCount(0);
  await expect(chatLog(page)).toBeVisible();
});

test('a laptop keeps the table layout, without the phone tabs', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await atTable(page, PLAYER_1);
  await expect(chatLog(page)).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Phone tabs' })).toHaveCount(0);
});
