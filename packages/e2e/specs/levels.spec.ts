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

// Stairs north of Bram, past a railing that stands only on the loft.
const STAIRS = {
  id: 'stairs',
  name: 'Stairs',
  levels: ['ground', 'loft'],
  points: [
    [600, 500],
    [700, 500],
    [700, 580],
    [600, 580],
  ],
  behaviors: [{ type: 'stairs', between: ['ground', 'loft'] }],
};
const RAILING = { id: 'loft-railing', a: [550, 600], b: [750, 600], level: 'loft' };

async function addFloors(dir: string): Promise<void> {
  const scene = join(dir, 'scenes', 'crossroads');
  const file = join(scene, 'scene.json');
  const settings = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
  await writeFile(file, JSON.stringify({ ...settings, levels: LEVELS }, null, 2));
  await writeFile(join(scene, 'regions.json'), JSON.stringify([LIFT, STAIRS], null, 2));
  const walls = JSON.parse(await readFile(join(scene, 'walls.json'), 'utf8')) as unknown[];
  await writeFile(join(scene, 'walls.json'), JSON.stringify([...walls, RAILING], null, 2));
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

test('a player sees the stairs, walks past the walls of the floor above and climbs them', async ({ page }) => {
  await atTable(page, PLAYER_2);
  await expect.poll(() => page.evaluate(() => vtt.docs('crossroads/regions').map((r) => r.id))).toContain('stairs');
  await page.evaluate(() => vtt.send({ t: 'move', token: 'bram', to: [650, 540] }));
  await expect.poll(() => page.evaluate(() => vtt.token('bram')?.elevation)).toBe(10);
});
