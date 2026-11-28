// The GM's error log: an error in a player's browser shows up in the GM's
// Errors tab, with a count on the tab until the GM looks, and can be cleared.

import { expect, test } from '../support/fixtures.ts';
import { GM, PLAYER_1, atTable } from '../support/table.ts';

test('an error in a player’s browser reaches the GM’s error log', async ({ page, seat }) => {
  await atTable(page, GM);
  const player = await seat(PLAYER_1);
  await player.evaluate(() => {
    setTimeout(() => {
      throw new Error('the map fell over');
    });
  });
  const tab = page.getByRole('tab', { name: /^Errors: 1 new/ });
  await expect(tab).toBeVisible();
  await tab.click();
  const log = page.getByRole('list', { name: 'Errors' });
  await expect(log).toContainText('Error: the map fell over');
  await expect(log).toContainText(PLAYER_1);
  await expect(page.getByRole('tab', { name: 'Errors', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.getByText('No errors so far.')).toBeVisible();
});

test('players have no Errors tab', async ({ page }) => {
  await atTable(page, PLAYER_1);
  await expect(page.getByRole('tab', { name: 'Journal' })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Errors/ })).toHaveCount(0);
});
