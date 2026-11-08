// Who plays what: the GM ticks the creatures each player plays in the
// Players tab (giving and taking them at once), and a player's seat is one
// browser's at a time.

import { expect, test } from '../support/fixtures.ts';
import { GM, HOME, PLAYER_1, PLAYER_2, atTable, placeSeen } from '../support/table.ts';

test('the GM gives a player a second creature and takes it away again', async ({ page, seat }) => {
  await atTable(page, GM);
  const player = await seat(PLAYER_2);
  await page.getByRole('tab', { name: 'Players' }).click();
  await page.getByRole('button', { name: `What ${PLAYER_2} plays` }).click();
  const picker = page.locator('[data-slot="plays-pick"]');
  await expect(picker.getByRole('checkbox', { name: 'Bram' })).toBeChecked();
  await picker.getByRole('checkbox', { name: 'Innkeeper' }).click();
  await expect(page.getByRole('button', { name: `What ${PLAYER_2} plays` })).toContainText('Bram, Innkeeper');

  await player.evaluate(() => vtt.move('innkeeper', 550, 450));
  await expect.poll(() => placeSeen(page, 'innkeeper')).toEqual([550, 450]);

  await picker.getByRole('checkbox', { name: 'Innkeeper' }).click();
  await expect(picker.getByRole('checkbox', { name: 'Innkeeper' })).not.toBeChecked();
  await player.evaluate(() => vtt.move('innkeeper', 550, 350));
  await expect(player.getByText(/You don't control Innkeeper/)).toBeVisible();
  expect(await placeSeen(page, 'innkeeper')).toEqual([550, 450]);
});

test('a second browser cannot join as a player someone is playing', async ({ browser, server, seat }) => {
  await seat(PLAYER_1);
  const other = await (await browser.newContext({ baseURL: server.url })).newPage();
  await other.goto(`/#/join/${HOME}`);
  await other.getByRole('combobox', { name: 'Your player' }).click();
  await other.getByRole('option', { name: /^Player 1 / }).click();
  await other.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(other.getByText(`${PLAYER_1} is already playing from another browser.`)).toBeVisible();
  await expect(other).toHaveURL(new RegExp(`#/join/${HOME}$`));
  await other.context().close();
});
