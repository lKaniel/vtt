// The GM's "ignore walls" mode (the ghost in the top bar, Shift+W): a
// creature stuck in a wall, or walled in, goes straight where the GM sends
// it. Bram is in the tavern; (950, 650) is in the locked cellar, which no
// walk reaches.

import { expect, test } from '../support/fixtures.ts';
import { GM, PLAYER_2, atTable, placeSeen } from '../support/table.ts';

const CELLAR: [number, number] = [950, 650];

test.describe.configure({ timeout: 90_000 });

test('the GM sends Bram through the walls into the locked cellar; players have no such switch', async ({
  page,
  seat,
}) => {
  await atTable(page, GM);
  await page.evaluate(([x, y]) => vtt.move('bram', x, y), CELLAR);
  await expect(page.getByText(/can't get there/i)).toBeVisible();
  expect(await placeSeen(page, 'bram')).toEqual([650, 650]);

  const ghost = page.getByRole('button', { name: /^Ignore walls/ });
  await ghost.click();
  await expect(ghost).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(([x, y]) => vtt.move('bram', x, y), CELLAR);
  await expect.poll(() => placeSeen(page, 'bram')).toEqual(CELLAR);

  const player = await seat(PLAYER_2);
  await expect(player.getByRole('button', { name: /^Ignore walls/ })).toHaveCount(0);
});
