// World time: the GM's clock and calendar, as everyone at the table sees it.

import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.ts';
import { GM, PLAYER_2, atTable } from '../support/table.ts';

/** The clock in the GM's top bar; it opens the time panel. */
const clock = (page: Page) => page.getByRole('banner').getByRole('button', { name: /^\d+ \w+ \d+, \d\d:\d\d$/ });

test('passing time moves everyone’s clock', async ({ page, seat }) => {
  await atTable(page, GM);
  const player = await seat(PLAYER_2);
  await clock(page).click();
  await page.getByRole('dialog').getByRole('button', { name: '+1 h' }).click();
  await expect(clock(page)).toHaveText('1 Jan 1, 01:00');
  await expect(player.getByRole('banner')).toContainText('1 Jan 1, 01:00');
});

test('the GM sets the date on the calendar', async ({ page }) => {
  await atTable(page, GM);
  await clock(page).click();
  const panel = page.getByRole('dialog');
  await panel.getByRole('gridcell', { name: '15' }).click();
  await panel.getByRole('button', { name: 'Set date & time' }).click();
  await expect(clock(page)).toHaveText('15 Jan 1, 00:00');
});

test('started time runs on by itself', async ({ page }) => {
  await atTable(page, GM);
  await clock(page).click();
  const panel = page.getByRole('dialog');
  await panel.getByRole('radio', { name: '1 h/s' }).click();
  await panel.getByRole('button', { name: 'Start time' }).click();
  await expect(clock(page)).not.toHaveText('1 Jan 1, 00:00');
});
