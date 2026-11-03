// Floors of a scene (docs/game-format.md, "Scene levels"): an elevator south
// of Bram asks the player moving him which floor to take him to.

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '../support/fixtures.ts';
import { PLAYER_2, atTable } from '../support/table.ts';

const LEVELS = [
  { id: 'ground', name: 'Ground', bottom: 0 },
  { id: 'loft', name: 'Loft', bottom: 10 },
];

const LIFT = {
  id: 'lift',
  name: 'Lift',
  points: [
    [600, 700],
    [700, 700],
    [700, 800],
    [600, 800],
  ],
  behaviors: [{ type: 'elevator' }],
};

async function addFloors(dir: string): Promise<void> {
  const scene = join(dir, 'scenes', 'crossroads');
  const file = join(scene, 'scene.json');
  const settings = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
  await writeFile(file, JSON.stringify({ ...settings, levels: LEVELS }, null, 2));
  await writeFile(join(scene, 'regions.json'), JSON.stringify([LIFT], null, 2));
}

test.use({ serverOptions: { prepare: addFloors } });

test('an elevator asks which floor, and takes the creature there', async ({ page }) => {
  await atTable(page, PLAYER_2);
  await page.evaluate(() => vtt.send({ t: 'move', token: 'bram', to: [650, 750] }));
  const ask = page.getByRole('dialog', { name: 'Bram: which floor?' });
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Loft' }).click();
  await expect(ask).toBeHidden();
  await expect.poll(() => page.evaluate(() => vtt.token('bram')?.elevation)).toBe(10);
});
