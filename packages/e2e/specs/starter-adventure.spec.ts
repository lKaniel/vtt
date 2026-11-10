// The example world's starter adventure, The Mill Road: the party walks the
// road east, the bandits hidden in the woods show themselves when someone
// steps into the ambush, and the quest is in the adventure book.

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '../support/fixtures.ts';
import { PLAYER_2, atTable, chatLog, idsSeen } from '../support/table.ts';

const FOES = ['bandit-1', 'bandit-2', 'scout-1', 'scout-2'];

/** Opens the game on the Mill Road instead of the crossroads. */
async function onMillRoad(gameDir: string): Promise<void> {
  const file = join(gameDir, 'game.json');
  const game = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
  await writeFile(file, JSON.stringify({ ...game, scene: 'mill-road' }, null, 2));
}

test.describe.configure({ timeout: 90_000 });
test.use({ serverOptions: { prepare: onMillRoad } });

test('walking into the ambush brings the bandits out of the trees', async ({ page }) => {
  await atTable(page, PLAYER_2);
  await expect.poll(() => idsSeen(page)).toContain('bram');
  expect(await page.evaluate(() => vtt.token('bram')?.img)).toBe('/assets/tokens/bram.svg');
  for (const id of FOES) expect(await idsSeen(page)).not.toContain(id);

  await page.evaluate(() => vtt.move('bram', 1250, 950));
  await expect(chatLog(page).getByText(/Arrows hiss out of the trees/)).toBeVisible();
  await expect
    .poll(async () => (await idsSeen(page)).filter((id) => FOES.includes(id)).sort((a, b) => a.localeCompare(b)))
    .toEqual(FOES);
});

test('the missing miller is an open quest in the adventure book', async ({ page }) => {
  await atTable(page, PLAYER_2);
  await page.keyboard.press('j');
  const book = page.getByRole('dialog', { name: /Adventure book/i });
  await expect(book.getByRole('button', { name: 'The Missing Miller' })).toBeVisible();
  await expect(book.getByRole('button', { name: 'The Mill Road (GM)' })).toHaveCount(0);
});
