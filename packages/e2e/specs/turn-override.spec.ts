// Turn overrides: a trusted player gives their creature back its action or
// more movement mid-fight from the action bar's Override button; a plain
// player has no such button.

import { expect, test } from '../support/fixtures.ts';
import { GM, PLAYER_2, atTable, chatLog } from '../support/table.ts';

test('a trusted player overrides their own turn, a plain player cannot', async ({ page, seat }) => {
  await atTable(page, GM);
  const player = await seat(PLAYER_2);
  await page.evaluate(() => vtt.send({ t: 'combatStart', tokens: ['bram'] }));
  await expect(chatLog(page).getByText(/Roll for initiative!/)).toBeVisible();
  await expect.poll(() => player.evaluate(() => vtt.selected()?.id)).toBe('bram');
  await expect(player.getByRole('button', { name: 'Override' })).toHaveCount(0);

  await page.evaluate(() => vtt.send({ t: 'setRole', player: 'player2', role: 'trusted' }));
  await player.getByRole('button', { name: 'Override' }).click();
  const panel = player.locator('[data-slot="turn-override"]');
  const action = panel.getByRole('button', { name: 'Action', exact: true });
  await expect(action).toHaveAttribute('aria-pressed', 'true');
  await action.click();
  await expect(action).toHaveAttribute('aria-pressed', 'false');
  await expect(chatLog(page).getByText(/Override: Bram has no action left/)).toBeVisible();
  await action.click();
  await expect(action).toHaveAttribute('aria-pressed', 'true');

  const before = Number(await panel.getByRole('textbox', { name: 'Movement left (ft)' }).inputValue());
  await panel.getByRole('button', { name: /^\+\d+ ft$/ }).click();
  await expect
    .poll(async () => Number(await panel.getByRole('textbox', { name: 'Movement left (ft)' }).inputValue()))
    .toBeGreaterThan(before);
});
