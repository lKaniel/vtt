// Pointing at the map. A scene opens with its camera centred on the scene's
// `start` at zoom 0.6 (MapView), so until a spec pans or zooms, a world point
// sits at a known place on the canvas.

import type { Page } from '@playwright/test';

/** The crossroads' `start` in world/scenes/crossroads/scene.json. */
const START: readonly [number, number] = [1000, 900];
const ZOOM = 0.6;

/** Where world point (x, y) is on the page, for a camera that hasn't moved. */
export async function screenOf(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const box = await page.evaluate(() => {
    const r = document.querySelector('.map canvas')?.getBoundingClientRect();
    return r && { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  if (!box) throw new Error('no map canvas');
  return {
    x: box.x + box.width / 2 + (x - START[0]) * ZOOM,
    y: box.y + box.height / 2 + (y - START[1]) * ZOOM,
  };
}

/** Drags with the mouse from one world point to another, in a few steps (each input waits for a frame, and software WebGL draws only a few a second). */
export async function dragOnMap(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const a = await screenOf(page, ...from);
  const b = await screenOf(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.mouse.up();
}
