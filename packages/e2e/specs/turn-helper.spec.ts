// The GM's turn helper: on a monster's turn the turn order bar offers its
// best attack and target on one button, and clicking it makes the attack.
// Players never see it.

import { expect, test } from '../support/fixtures.ts';
import { placeToken } from '../support/files.ts';
import { GM, PLAYER_2, atTable, chatLog } from '../support/table.ts';

/** The goblin stands next to Bram. */
test.use({ serverOptions: { prepare: (dir: string) => placeToken(dir, 'goblin-1', 750, 750) } });

test('the GM takes a goblin’s suggested attack in one click', async ({ page, seat }) => {
  await atTable(page, GM);
  const player = await seat(PLAYER_2);
  await page.evaluate(() => vtt.send({ t: 'combatStart', tokens: ['bram', 'goblin-1'] }));
  await expect(chatLog(page).getByText(/Roll for initiative!/)).toBeVisible();
  await page.evaluate(() => vtt.send({ t: 'initiative', token: 'goblin-1', value: 30 }));
  const current = page.locator('.turn.current');
  if (!(await current.getAttribute('aria-label'))?.startsWith('Goblin')) {
    await page.evaluate(() => vtt.send({ t: 'endTurn' }));
  }
  await expect(current).toHaveAttribute('aria-label', /^Goblin/);

  const helper = page.getByRole('button', { name: /at Bram$/ });
  await expect(helper).toHaveAttribute('title', /best move: \d+% to hit/);
  await expect(player.locator('[data-slot="turn-helper"]')).toHaveCount(0);
  await helper.click();
  await expect(
    chatLog(page)
      .getByText(/Goblin.*(Scimitar|Shortbow)/)
      .first(),
  ).toBeVisible();
  await expect(page.locator('[data-slot="turn-helper"]')).toHaveCount(0);
});
