import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.ts';
import { enterTable } from '../support/table.ts';

/** Gives the admin password on Setup's locked screen. */
async function openSetup(page: Page, password: string): Promise<void> {
  await page.getByRole('textbox', { name: 'Admin password' }).fill(password);
  await page.getByRole('button', { name: 'Open Setup' }).click();
}

test('Setup makes a game and its maker joins it as Gamemaster', async ({ page }) => {
  await page.goto('/#/setup');
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('The Lost Mine');
  await page.getByRole('button', { name: 'Create game' }).click();
  await expect(page).toHaveURL(/#\/games\/the-lost-mine$/);

  await enterTable(page);
  expect(await page.evaluate(() => vtt.user())).toMatchObject({ name: 'Gamemaster', role: 'gm' });
  expect(await page.evaluate(() => vtt.tokens().length)).toBe(0);

  await page.goto('/');
  await expect(page.getByRole('button', { name: /The Lost Mine/ })).toBeVisible();
});

test('an admin password set in Setup locks Setup for everyone else', async ({ page, browser, server }) => {
  await page.goto('/#/setup');
  await page.getByRole('textbox', { name: 'New admin password' }).fill('dragon');
  await page.getByRole('button', { name: 'Set password' }).click();
  await expect(page.getByText(/has no admin password/)).toHaveCount(0);

  const other = await (await browser.newContext({ baseURL: server.url })).newPage();
  await other.goto('/#/setup');
  await expect(other.getByRole('button', { name: 'Create game' })).toHaveCount(0);
  await openSetup(other, 'not it');
  await expect(other.getByRole('button', { name: 'Create game' })).toHaveCount(0);
  await openSetup(other, 'dragon');
  await expect(other.getByRole('button', { name: 'Create game' })).toBeVisible();
  await other.context().close();
});

test.describe('with VTT_ADMIN_PASSWORD set', () => {
  test.use({ serverOptions: { adminPassword: 'hunter2' } });

  test('Setup opens with it and cannot change it', async ({ page }) => {
    await page.goto('/#/setup');
    await openSetup(page, 'hunter2');
    await expect(page.getByRole('button', { name: 'Create game' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'New admin password' })).toHaveCount(0);
  });
});
