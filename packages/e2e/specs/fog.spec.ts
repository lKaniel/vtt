// Fog of war (docs/editor.md, fog-keeper.ts): the GM paints explored ground
// in for one player with the Reveal brush, that player's map shows it, and
// Reset forgets it again.

import { expect, test } from '../support/fixtures.ts';
import { dragOnMap } from '../support/map.ts';
import { GM, PLAYER_2, atTable } from '../support/table.ts';

test.describe.configure({ timeout: 90_000 });

/** Out on the road, where the party, shut in the inn, has not been. */
const FAR: [number, number] = [1100, 1050];

test('the GM reveals ground to a player and resets it', async ({ page, seat }) => {
  await atTable(page, GM);
  const player = await seat(PLAYER_2);
  const explored = () => player.evaluate(([x, y]) => vtt.explored(x, y), FAR);
  expect(await explored()).toBe(false);

  await page.getByRole('button', { name: 'Fog and daylight' }).click();
  const fog = page.getByRole('toolbar', { name: 'Fog of war' });
  await fog.getByRole('combobox', { name: 'Whose fog' }).click();
  await page.getByRole('option', { name: 'Player 2' }).click();
  await fog.getByRole('button', { name: 'Reveal' }).click();
  await dragOnMap(page, [FAR[0] - 100, FAR[1]], [FAR[0] + 100, FAR[1]]);
  await expect.poll(explored).toBe(true);
  // The GM's map shows the player's fog too.
  expect(await page.evaluate(([x, y]) => vtt.explored(x, y), FAR)).toBe(true);

  await fog.getByRole('button', { name: 'Reset' }).click();
  await expect.poll(explored).toBe(false);
});
