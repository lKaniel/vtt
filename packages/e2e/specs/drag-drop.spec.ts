// Dragging gear out of a character sheet, as in Foundry: onto another
// creature on the map (handed over), onto the ground (a pile of loot) and
// into a bag on the same sheet (packed). The side panel's drags (Compendium,
// Actors, Assets) are in compendium.spec.ts and sidebar.spec.ts.

import type { Locator, Page } from '@playwright/test';
import { editActor } from '../support/files.ts';
import { expect, test } from '../support/fixtures.ts';
import { screenOf } from '../support/map.ts';
import { GM, PLAYER_2, atTable, idsSeen } from '../support/table.ts';

test.describe.configure({ timeout: 150_000 });
// Room for the sheet beside the inn (Bram, Vesper and Orrin stand at its south wall).
test.use({ viewport: { width: 1700, height: 950 } });

test.beforeEach(async ({ page }) => {
  // Where the sheet window opens, as if the person had put it there last time.
  await page.addInitScript(() =>
    localStorage.setItem('vtt:window-sheet', JSON.stringify({ x: 760, y: 10, w: 600, h: 600 })),
  );
});

const BRAM: [number, number] = [650, 650];

async function openBram(page: Page): Promise<Locator> {
  const p = await screenOf(page, ...BRAM);
  await page.mouse.click(p.x, p.y);
  await page.keyboard.press('c');
  const sheet = page.getByRole('region', { name: "Bram's character sheet" });
  await expect(sheet).toBeVisible();
  return sheet;
}

/** Drags `from` with the mouse and lets go at a point on the page. */
async function dragTo(page: Page, from: Locator, to: { x: number; y: number }): Promise<void> {
  await from.scrollIntoViewIfNeeded();
  const box = (await from.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y + box.height / 2 + 10, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

async function middleOf(locator: Locator) {
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const carried = (page: Page, id: string, item: string) =>
  page.evaluate(([id, item]) => vtt.token(id!)?.inventory?.find((e) => e.item === item)?.qty ?? 0, [id, item]);

test('a player hands potions from the sheet to a friend on the map and drops torches on the ground', async ({
  page,
}) => {
  await atTable(page, PLAYER_2);
  const sheet = await openBram(page);

  await dragTo(page, sheet.getByRole('listitem', { name: 'Potion of Healing' }), await screenOf(page, 750, 650)); // Orrin
  await expect.poll(() => carried(page, 'bram', 'potion-of-healing')).toBe(0);

  const before = await idsSeen(page);
  await dragTo(page, sheet.getByRole('listitem', { name: 'Torch' }), await screenOf(page, 650, 580)); // the floor in front of Bram
  await expect.poll(async () => (await idsSeen(page)).filter((id) => !before.includes(id))).toHaveLength(1);
  expect(await carried(page, 'bram', 'torch')).toBe(0);
});

test.describe('with a backpack', () => {
  test.use({
    serverOptions: {
      prepare: (dir) =>
        editActor(dir, 'bram', (a) => ({
          ...a,
          inventory: [...(a.inventory as object[]), { item: 'backpack' }],
        })),
    },
  });

  test('the GM packs a torch into the backpack and hands potions over on another open sheet', async ({ page }) => {
    await atTable(page, GM);
    const sheet = await openBram(page);
    const bag = sheet.getByRole('region', { name: /Backpack/ });
    await bag.scrollIntoViewIfNeeded();
    await dragTo(page, sheet.getByRole('listitem', { name: 'Torch' }), await middleOf(bag));
    await expect(bag.getByRole('listitem', { name: 'Torch' })).toBeVisible();

    // Vesper's sheet opens over Bram's; moved aside by its title bar, it takes the potion.
    const v = await screenOf(page, 550, 650);
    await page.mouse.click(v.x, v.y);
    await page.keyboard.press('c');
    const vesper = page.getByRole('region', { name: "Vesper's character sheet" });
    await expect(vesper).toBeVisible();
    const title = (await vesper.boundingBox())!;
    await page.mouse.move(title.x + 60, title.y + 14);
    await page.mouse.down();
    await page.mouse.move(title.x - 440, title.y + 214, { steps: 4 });
    await page.mouse.up();
    await dragTo(page, sheet.getByRole('listitem', { name: 'Potion of Healing' }), await middleOf(vesper));
    await expect.poll(() => carried(page, 'vesper', 'potion-of-healing')).toBe(2);
  });
});

test.describe('with the sheet over the action bar', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem('vtt:window-sheet', JSON.stringify({ x: 300, y: 300, w: 900, h: 640 })),
    );
  });

  test('a player still drops a potion from the sheet onto the bar under it', async ({ page }) => {
    await atTable(page, PLAYER_2);
    const sheet = await openBram(page);
    const slot = page.getByRole('contentinfo').locator('.tile').nth(14);
    await dragTo(page, sheet.getByRole('listitem', { name: 'Potion of Healing' }), await middleOf(slot));
    await expect.poll(() => page.evaluate(() => vtt.token('bram')?.hotbar?.[14])).toBe('item:potion-of-healing');
  });
});
