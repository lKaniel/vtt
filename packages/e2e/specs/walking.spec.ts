// Walking without a grid, as in BG3: resting the pointer on open ground
// previews the walk there and warns of what it would set off.
// goblin-1 is moved next to Bram (south of him) before the server starts;
// Bram is in the tavern, Orrin beside him to the east.

import type { Page } from '@playwright/test';
import { placeToken } from '../support/files.ts';
import { expect, test } from '../support/fixtures.ts';
import { screenOf } from '../support/map.ts';
import { GM, atTable, chatLog } from '../support/table.ts';

const BRAM: [number, number] = [650, 650];
const GOBLIN: [number, number] = [650, 750];

test.describe.configure({ timeout: 90_000 });
test.use({ serverOptions: { prepare: (dir) => placeToken(dir, 'goblin-1', ...GOBLIN) } });

interface Shown {
  token: string;
  feet: number | null;
  warnings: { kind: string; text: string }[];
}

/** Starts collecting the walks the map previews (the `walkPreview` hook). */
async function watchPreviews(page: Page): Promise<() => Promise<Shown | undefined>> {
  await page.evaluate(() => {
    const seen: unknown[] = [];
    window.seen = seen;
    vtt.hooks.on('walkPreview', (shown) => seen.push(shown));
  });
  return () => page.evaluate(() => window.seen?.at(-1) as Shown | undefined);
}

async function pointAt(page: Page, at: [number, number]): Promise<void> {
  const p = await screenOf(page, ...at);
  await page.mouse.move(p.x, p.y, { steps: 3 });
}

test('resting the pointer on the ground previews the walk there, curving round Orrin', async ({ page }) => {
  await atTable(page, GM);
  const last = await watchPreviews(page);
  const bram = await screenOf(page, ...BRAM);
  await page.mouse.click(bram.x, bram.y);
  // Orrin stands just east of Bram, across the straight line.
  await pointAt(page, [800, 400]);
  await expect.poll(async () => (await last())?.feet).toBe(15);
  expect((await last())?.token).toBe('bram');
});

test('in a fight, the preview warns of an opportunity attack from a foe you walk away from', async ({ page }) => {
  await atTable(page, GM);
  const last = await watchPreviews(page);
  await page.evaluate(() => vtt.send({ t: 'combatStart', tokens: ['bram', 'goblin-1'] }));
  await expect(chatLog(page).getByText(/Roll for initiative!/)).toBeVisible();
  // The GM is handed whoever is up; the camera follows them.
  await expect.poll(() => page.evaluate(() => vtt.selected()?.id)).toMatch(/^(bram|goblin-1)$/);
  if ((await page.evaluate(() => vtt.selected()?.id)) !== 'bram') {
    await page.getByRole('button', { name: 'End turn' }).click();
  }
  await expect.poll(() => page.evaluate(() => vtt.selected()?.id)).toBe('bram');
  // Rest the pointer a little north of Bram, away from the goblin to his south.
  const box = (await page.locator('.map canvas').boundingBox())!;
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await expect
    .poll(async () => {
      await page.mouse.move(x + 3, y - 150);
      await page.mouse.move(x, y - 150);
      return (await last())?.warnings.map((w) => w.text);
    })
    .toContain('Opportunity attack: Goblin');
});
