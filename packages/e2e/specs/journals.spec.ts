// Journal entries (docs/game-format.md): the GM writes one, the players see
// nothing until it is shared, then read it, and Show puts it on their screens.

import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.ts';
import { GM, PLAYER_2, atTable } from '../support/table.ts';

test.describe.configure({ timeout: 90_000 });

const entry = (page: Page, name: string) => page.getByRole('listitem').filter({ hasText: name });
const viewer = (page: Page, name: string) => page.getByRole('dialog', { name, exact: true });

async function command(page: Page, name: string, label: string): Promise<void> {
  await entry(page, name).click({ button: 'right' });
  await page.getByRole('menuitem', { name: label }).click();
}

test('the GM writes an entry, shares it and shows it on the players’ screens', async ({ page, seat }) => {
  await atTable(page, GM);
  const player = await seat(PLAYER_2);
  await page.getByRole('tab', { name: 'Journal' }).click();
  await page.getByRole('button', { name: 'New', exact: true }).click();
  const open = viewer(page, 'New entry');
  await open.getByRole('button', { name: 'Page' }).click();
  const text = open.getByRole('textbox', { name: 'Page text' });
  await text.fill('The bridge is out; the ford is guarded.');
  await text.blur();
  await open.getByRole('button', { name: 'Done' }).click();
  await expect(open).toContainText('The bridge is out');

  await player.getByRole('tab', { name: 'Journal' }).click();
  await expect(player.getByText('Nothing has been shared with you yet.')).toBeVisible();

  await command(page, 'New entry', 'Let the players read it');
  await expect(entry(player, 'New entry')).toBeVisible();

  await command(page, 'New entry', "Show on every player's screen");
  await expect(viewer(player, 'New entry')).toContainText('The bridge is out; the ford is guarded.');
  // A player reads it but can't edit it.
  await expect(viewer(player, 'New entry').getByRole('button', { name: 'Edit text' })).toHaveCount(0);
});
