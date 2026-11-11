// Playing on a tablet: a tap selects and walks, one finger drags the map, two
// fingers pinch to zoom, and a finger held still opens the menu. The touches
// go through the browser's own touch input (CDP), as a finger would.
// Bram stands at (650, 650) in the tavern; the camera starts as map.ts says.

import type { CDPSession, Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.ts';
import { screenOf } from '../support/map.ts';
import { GM, atTable, placeSeen } from '../support/table.ts';

const BRAM: [number, number] = [650, 650];

test.use({ hasTouch: true });

type Finger = [number, number];

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Puts fingers down, moves them in `steps` to where they end, and lifts them. */
async function gesture(cdp: CDPSession, from: Finger[], to: Finger[], { steps = 4, holdMs = 0 } = {}): Promise<void> {
  const points = (at: Finger[]) => at.map(([x, y], id) => ({ x, y, id }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(from) });
  if (holdMs) await pause(holdMs);
  for (let i = 1; i <= steps; i++) {
    const at = from.map(([x, y], k): Finger => [x + ((to[k]![0] - x) * i) / steps, y + ((to[k]![1] - y) * i) / steps]);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(at) });
  }
  // Rest before lifting, so a drag doesn't fling the map on.
  if (steps) await pause(200);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function tap(cdp: CDPSession, at: { x: number; y: number }): Promise<void> {
  await gesture(cdp, [[at.x, at.y]], [[at.x, at.y]], { steps: 0 });
}

async function canvasCentre(page: Page): Promise<{ x: number; y: number }> {
  const box = (await page.locator('.map canvas').boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('a tap selects a creature and a tap on open ground walks it there', async ({ page }) => {
  await atTable(page, GM);
  const cdp = await page.context().newCDPSession(page);
  await tap(cdp, await screenOf(page, ...BRAM));
  await expect.poll(() => page.evaluate(() => vtt.selected()?.id)).toBe('bram');
  // A step south, clear of Vesper and Orrin to either side.
  await tap(cdp, await screenOf(page, 650, 750));
  await expect.poll(() => placeSeen(page, 'bram')).toEqual([650, 750]);
});

test('one finger drags the map and two fingers pinch it closer', async ({ page }) => {
  await atTable(page, GM);
  const cdp = await page.context().newCDPSession(page);
  const c = await canvasCentre(page);
  // Drag open ground 100 px right and down: the whole map follows.
  await gesture(cdp, [[c.x + 150, c.y + 100]], [[c.x + 250, c.y + 200]]);
  // Spread two fingers to twice their gap round the middle: the zoom doubles (0.6 to 1.2).
  await gesture(
    cdp,
    [
      [c.x - 60, c.y],
      [c.x + 60, c.y],
    ],
    [
      [c.x - 120, c.y],
      [c.x + 120, c.y],
    ],
  );
  const before = await screenOf(page, ...BRAM);
  const bram = { x: c.x + (before.x + 100 - c.x) * 2, y: c.y + (before.y + 100 - c.y) * 2 };
  await tap(cdp, bram);
  await expect.poll(() => page.evaluate(() => vtt.selected()?.id)).toBe('bram');
});

test('a finger held still on the ground opens the map menu', async ({ page }) => {
  await atTable(page, GM);
  const cdp = await page.context().newCDPSession(page);
  const at = await screenOf(page, 1000, 1000);
  await gesture(cdp, [[at.x, at.y]], [[at.x, at.y]], { steps: 1, holdMs: 800 });
  await expect(page.getByRole('menu')).toBeVisible();
});
