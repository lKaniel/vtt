// Connecting Claude from the table: the top bar's Claude button makes a key
// and shows the command that adds this server to Claude Code.

import { expect, test } from '../support/fixtures.ts';
import { PLAYER_2, atTable } from '../support/table.ts';

test('a player connects Claude from the top bar', async ({ page }) => {
  await atTable(page, PLAYER_2);
  await page.getByRole('banner').getByRole('button', { name: 'Connect Claude' }).click();
  const box = page.locator('[data-slot=claude-key]');
  await expect(box).toContainText('You have no key yet.');
  await box.getByRole('button', { name: 'Make a key' }).click();
  await expect(box.getByRole('textbox')).toHaveValue(/claude mcp add --transport http vtt .*\/mcp/);
  await box.getByRole('button', { name: 'Remove key' }).click();
  await expect(box).toContainText('You have no key yet.');
});
