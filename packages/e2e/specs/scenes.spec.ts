// The map as the GM shapes it: walls (drawn in the editor, undone), doors
// that block sight until opened, and scenes the table moves between.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { placeToken } from '../support/files.ts';
import { expect, test } from '../support/fixtures.ts';
import { screenOf } from '../support/map.ts';
import { GM, PLAYER_2, atTable, idsSeen } from '../support/table.ts';

/** The tavern's door, in the middle of its south wall. */
const DOOR: [number, number] = [750, 800];
/** Just outside that door, in Bram's torchlight and line of sight once it opens. */
const OUTSIDE: [number, number] = [800, 900];

/** The walls the server wrote to the scene's file. */
async function wallsOnDisk(gameDir: string): Promise<{ id: string; a: number[]; b: number[] }[]> {
  return JSON.parse(await readFile(join(gameDir, 'scenes/crossroads/walls.json'), 'utf8')) as {
    id: string;
    a: number[];
    b: number[];
  }[];
}

test('the GM draws a wall in the editor and undoes it', async ({ page, server }) => {
  await atTable(page, GM);
  const before = (await wallsOnDisk(server.gameDir)).length;
  await page.getByRole('button', { name: 'Walls' }).click();
  await page.getByRole('button', { name: 'Wall', exact: true }).click();
  const ends: [number, number][] = [
    [1100, 1300],
    [1500, 1300],
  ];
  for (const [x, y] of ends) {
    const at = await screenOf(page, x, y);
    await page.mouse.click(at.x, at.y);
  }
  await page.keyboard.press('Escape');
  await expect
    .poll(async () => (await wallsOnDisk(server.gameDir)).at(-1))
    .toMatchObject({ a: [1100, 1300], b: [1500, 1300] });

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await wallsOnDisk(server.gameDir)).length).toBe(before);
});

test.describe('a closed door', () => {
  test.use({ serverOptions: { prepare: (dir) => placeToken(dir, 'goblin-1', ...OUTSIDE) } });

  test('hides what is behind it until the GM opens it', async ({ page, seat }) => {
    await atTable(page, GM);
    const player = await seat(PLAYER_2);
    expect(await idsSeen(page)).toContain('goblin-1');
    expect(await idsSeen(player)).not.toContain('goblin-1');

    const door = await screenOf(page, ...DOOR);
    await page.mouse.click(door.x, door.y);
    await expect.poll(() => idsSeen(player)).toContain('goblin-1');
  });
});

test('Play here takes everyone to a new scene', async ({ page, seat }) => {
  await atTable(page, GM);
  const player = await seat(PLAYER_2);
  await page.getByRole('tab', { name: 'Scenes' }).click();
  await page.getByRole('textbox', { name: 'New scene name' }).fill('Cellar');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const cellar = page.getByRole('listitem').filter({ hasText: 'Cellar' });
  await cellar.getByRole('button', { name: 'Play here' }).click();

  await expect(player.getByRole('banner')).toContainText('Cellar');
  await expect(page.getByRole('banner')).toContainText('Cellar');
  expect(await idsSeen(player)).not.toContain('bram');
});
