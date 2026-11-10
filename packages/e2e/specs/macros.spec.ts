// Macros (docs/scripting.md): the GM writes a chat macro, runs it and shares
// it, a player runs the shared one, and a GM script macro acts through `vtt`.

import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.ts';
import { GM, PLAYER_2, atTable, chatLog } from '../support/table.ts';

test.describe.configure({ timeout: 90_000 });

const macro = (page: Page, name: string) => page.getByRole('listitem').filter({ hasText: name });

/** Runs a macro from its right-click menu. */
async function run(page: Page, name: string): Promise<void> {
  await macro(page, name).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Run' }).click();
}

/** Makes a macro and writes it in its editor; `script` turns it into a script macro first. */
async function write(page: Page, name: string, command: string, script = false): Promise<void> {
  await page.getByRole('button', { name: 'New macro' }).click();
  await macro(page, 'New macro').click();
  const editor = page.getByRole('dialog').filter({ has: page.getByRole('textbox', { name: 'Name' }) });
  await editor.getByRole('textbox', { name: 'Name' }).fill(name);
  if (script) await editor.getByRole('radio', { name: 'Script' }).click();
  const body = editor.getByRole('textbox', { name: script ? 'Script' : 'Chat lines' });
  await body.fill(command);
  await body.blur();
  await expect(macro(page, name)).toBeVisible();
  await page.keyboard.press('Escape');
}

test('the GM shares a chat macro and a player runs it', async ({ page, seat }) => {
  await atTable(page, GM);
  const player = await seat(PLAYER_2);
  await page.getByRole('tab', { name: 'Macros' }).click();
  await write(page, 'Battle cry', 'For the crossroads!');
  await run(page, 'Battle cry');
  await macro(page, 'Battle cry').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Share' }).click();

  await player.getByRole('tab', { name: 'Macros' }).click();
  await run(player, 'Battle cry');
  await page.getByRole('tab', { name: 'Adventure log' }).click();
  await expect(chatLog(page).getByText('For the crossroads!')).toHaveCount(2);
});

test('a GM script macro acts through vtt', async ({ page }) => {
  await atTable(page, GM);
  await page.getByRole('tab', { name: 'Macros' }).click();
  await write(page, 'Head count', 'vtt.chat(`${vtt.tokens().length} on the map`)', true);
  await expect(macro(page, 'Head count')).toContainText('script');
  await run(page, 'Head count');
  const count = await page.evaluate(() => vtt.tokens().length);
  await page.getByRole('tab', { name: 'Adventure log' }).click();
  await expect(chatLog(page).getByText(`${count} on the map`)).toBeVisible();
});
