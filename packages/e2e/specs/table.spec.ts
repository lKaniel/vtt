// A GM and players at one table, each in a browser of their own.
// The crossroads (world/): Player 2 owns Bram, Player 1 owns Orrin and
// Vesper, goblin-2 is hidden from players.

import { expect, test } from '../support/fixtures.ts';
import { dragOnMap, screenOf } from '../support/map.ts';
import { GM, PLAYER_1, PLAYER_2, atTable, chatLog, idsSeen, placeSeen, say } from '../support/table.ts';

const BRAM: [number, number] = [650, 650];
const ORRIN: [number, number] = [750, 650];
const VESPER: [number, number] = [550, 650];

test.describe.configure({ timeout: 90_000 });

test('the GM sees hidden creatures and players do not', async ({ page, seat }) => {
  await atTable(page, GM);
  const player = await seat(PLAYER_2);
  expect(await idsSeen(page)).toEqual(expect.arrayContaining(['goblin-2', 'bram', 'orrin', 'innkeeper']));
  expect(await idsSeen(player)).toEqual(expect.arrayContaining(['bram', 'orrin', 'innkeeper']));
  expect(await idsSeen(player)).not.toContain('goblin-2');
});

test('a player drags their character and the GM sees it walk there', async ({ page, seat }) => {
  await atTable(page, GM);
  const player = await seat(PLAYER_2);
  await dragOnMap(player, BRAM, [650, 750]);
  await expect.poll(() => placeSeen(page, 'bram')).toEqual([650, 750]);
});

test("a player cannot drag someone else's character", async ({ page, seat }) => {
  await atTable(page, GM);
  const player = await seat(PLAYER_2);
  await dragOnMap(player, ORRIN, [750, 750]);
  // Then a move they may make, so the GM has heard everything the player sent.
  await dragOnMap(player, BRAM, [650, 750]);
  await expect.poll(() => placeSeen(page, 'bram')).toEqual([650, 750]);
  expect(await placeSeen(page, 'orrin')).toEqual(ORRIN);
});

test('the GM hides a creature from the players', async ({ page, seat }) => {
  await atTable(page, GM);
  const player = await seat(PLAYER_2);
  expect(await idsSeen(player)).toContain('vesper');

  const at = await screenOf(page, ...VESPER);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Hide from players' }).click();

  await expect.poll(() => idsSeen(player)).not.toContain('vesper');
  expect(await idsSeen(page)).toContain('vesper');
});

test('chat and rolls reach everyone at the table', async ({ page, seat }) => {
  await atTable(page, GM);
  const player = await seat(PLAYER_2);
  await say(player, 'Hello table');
  await say(player, '/r 1d20+5');
  await expect(chatLog(page).getByText('Hello table')).toBeVisible();
  await expect(chatLog(page).getByText('1d20+5')).toBeVisible();
  await expect(chatLog(player).getByText('1d20+5')).toBeVisible();
});

test('a roll for the GM stays between the roller and the GM', async ({ page, seat }) => {
  test.slow(); // three browsers
  await atTable(page, GM);
  const roller = await seat(PLAYER_2);
  const other = await seat(PLAYER_1);
  await say(roller, '/gmr 1d12+7');
  await say(roller, 'done rolling');
  await expect(chatLog(page).getByText('1d12+7')).toBeVisible();
  await expect(chatLog(roller).getByText('1d12+7')).toBeVisible();
  // The message after it has arrived, so the secret roll would have too.
  await expect(chatLog(other).getByText('done rolling')).toBeVisible();
  await expect(chatLog(other).getByText('1d12+7')).toHaveCount(0);
});

test('a paused game stops the players', async ({ page, seat }) => {
  await atTable(page, GM);
  const player = await seat(PLAYER_2);
  await page.getByRole('button', { name: 'Pause the game' }).click();
  await expect(player.getByRole('status').filter({ hasText: 'Game paused' })).toBeVisible();

  await dragOnMap(player, BRAM, [650, 750]);
  await say(player, 'still here');
  await expect(chatLog(page).getByText('still here')).toBeVisible();
  expect(await placeSeen(page, 'bram')).toEqual(BRAM);
});
