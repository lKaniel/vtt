// A player's own Actors tab: their character first, picked for them when
// they arrive, and placed on the map from the tab when it isn't there.

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '../support/fixtures.ts';

interface Stats {
  classes?: { level: number }[];
  abilities?: { int?: number };
}
import { PLAYER_1, PLAYER_2, atTable, idsSeen } from '../support/table.ts';

test('a player arrives with their character picked, and finds it from the Actors tab', async ({ page }) => {
  await atTable(page, PLAYER_2);
  await expect.poll(() => page.evaluate(() => vtt.selected()?.id)).toBe('bram');
  await page.getByRole('tab', { name: 'Actors' }).click();
  const card = page.locator('[data-slot="your-character"]');
  await expect(card).toContainText('Bram');
  await expect(card.getByRole('button', { name: 'Find' })).toBeVisible();
});

test('a player places their character when it is not on the map', async ({ page, server }) => {
  const file = join(server.gameDir, 'scenes/crossroads/tokens.json');
  const tokens = JSON.parse(await readFile(file, 'utf8')) as { id: string }[];
  await writeFile(file, JSON.stringify(tokens.filter((t) => t.id !== 'bram')));
  await atTable(page, PLAYER_2);
  await expect.poll(() => idsSeen(page)).not.toContain('bram');
  await page.getByRole('tab', { name: 'Actors' }).click();
  await page.locator('[data-slot="your-character"]').getByRole('button', { name: 'Place on map' }).click();
  await expect.poll(() => page.evaluate(() => vtt.tokens().some((t) => t.id.startsWith('bram')))).toBe(true);
  await expect(page.locator('[data-slot="your-character"]').getByRole('button', { name: 'Find' })).toBeVisible();
});

test('a player levels up their imported character from its sheet', async ({ page }) => {
  await atTable(page, PLAYER_1);
  await page.getByRole('tab', { name: 'Actors' }).click();
  await page.getByRole('listitem').filter({ hasText: 'Orrin' }).dblclick();
  await page.getByRole('button', { name: 'Level up' }).click();
  const dialog = page.getByRole('dialog', { name: 'Orrin: level up' });
  await dialog.getByRole('textbox', { name: 'Raise Intelligence' }).fill('2');
  await dialog.getByRole('button', { name: 'Reach level 4' }).click();
  const stats = async () => {
    const json = await page.evaluate(() => JSON.stringify(vtt.token('orrin') ?? {}));
    return (JSON.parse(json) as { stats?: Stats }).stats;
  };
  await expect.poll(async () => (await stats())?.classes?.[0]?.level).toBe(4);
  expect((await stats())?.abilities?.int).toBe(18);
});
