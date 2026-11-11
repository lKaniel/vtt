// A tile that asks (Monk's dialog buttons, see docs/foundry.md): a player
// pulls the well's rope with Bram, the question opens, and the answer they
// pick runs what it does.

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '../support/fixtures.ts';
import { PLAYER_2, atTable } from '../support/table.ts';

const WELL = {
  id: 'well',
  kind: 'image',
  x: 700,
  y: 600,
  w: 100,
  h: 100,
  src: '/assets/well.png',
  trigger: {
    on: 'click',
    near: 150,
    actions: [
      {
        type: 'choice',
        title: 'The well',
        text: 'Climb down the rope?',
        options: [
          { label: 'Climb down', actions: [{ type: 'teleport', to: [750, 850] }] },
          { label: 'Stay up', actions: [] },
        ],
      },
    ],
  },
};

async function addWell(dir: string): Promise<void> {
  const file = join(dir, 'scenes', 'crossroads', 'tiles.json');
  const tiles = JSON.parse(await readFile(file, 'utf8').catch(() => '[]')) as unknown[];
  await writeFile(file, JSON.stringify([...tiles, WELL], null, 2));
}

test.use({ serverOptions: { prepare: addWell } });

test("a tile's question asks the player who used it, and their answer runs", async ({ page }) => {
  await atTable(page, PLAYER_2);
  await page.evaluate(() => vtt.send({ t: 'trigger', tile: 'well', token: 'bram' }));
  const ask = page.getByRole('dialog', { name: 'The well' });
  await expect(ask).toContainText('Climb down the rope?');
  await ask.getByRole('button', { name: 'Climb down' }).click();
  await expect(ask).toBeHidden();
  await expect.poll(() => page.evaluate(() => vtt.token('bram')?.y)).toBe(850);
});
