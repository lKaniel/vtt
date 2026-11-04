// Objects, as in BG3: a player right-clicks a door to inspect it before
// using it. The tavern door is given a name and a description before the
// server starts; Bram stands in the tavern.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { editWall } from '../support/files.ts';
import { expect, test } from '../support/fixtures.ts';
import { screenOf } from '../support/map.ts';
import { PLAYER_2, atTable } from '../support/table.ts';

const BRAM: [number, number] = [650, 650];

test.describe.configure({ timeout: 90_000 });
test.use({
  serverOptions: {
    prepare: (dir) => editWall(dir, 'tavern-door', { name: 'Tavern door', description: 'Oak, bound in iron.' }),
  },
});

test('a player inspects the tavern door, then opens it from its card', async ({ page, server }) => {
  await atTable(page, PLAYER_2);
  const bram = await screenOf(page, ...BRAM);
  await page.mouse.click(bram.x, bram.y);
  const door = await screenOf(page, 750, 800);
  await page.mouse.click(door.x, door.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Inspect' }).click();
  const card = page.getByRole('dialog', { name: /Tavern door/ });
  await expect(card).toContainText('Oak, bound in iron.');
  await expect(card).toContainText('Closed');
  await card.getByRole('button', { name: 'Open' }).click();
  await expect(card).toBeHidden();
  await expect.poll(async () => (await doorOnDisk(server.gameDir))?.door).toBe('open');
});

async function doorOnDisk(gameDir: string): Promise<{ door?: string } | undefined> {
  const walls = JSON.parse(await readFile(join(gameDir, 'scenes/crossroads/walls.json'), 'utf8')) as {
    id: string;
    door?: string;
  }[];
  return walls.find((w) => w.id === 'tavern-door');
}
