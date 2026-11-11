// The GM's Compendium: finding things by name or filters, browsing them as
// pictures, and dragging them out onto the map.

import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.ts';
import { screenOf } from '../support/map.ts';
import { GM, atTable, idsSeen } from '../support/table.ts';

test.describe.configure({ timeout: 90_000 });

test('the GM narrows the spells by level and school', async ({ page }) => {
  await atTable(page, GM);
  await page.getByRole('tab', { name: 'Compendium' }).click();
  await page.getByRole('button', { name: 'Spells', exact: true }).click();

  await page.getByRole('combobox', { name: 'level' }).click();
  await page.getByRole('option', { name: /^Level 3/ }).click();
  await page.getByRole('combobox', { name: 'school' }).click();
  await page.getByRole('option', { name: /^Evocation/ }).click();

  const results = page.getByRole('listitem');
  await expect(results.filter({ hasText: 'Fireball' })).toBeVisible();
  await expect(results.filter({ hasText: 'Magic Missile' })).toHaveCount(0);

  // A word searches what entries are filed under, not only their names.
  await page.getByRole('button', { name: 'Clear' }).click();
  await page.getByRole('searchbox', { name: 'Search spells…' }).fill('necromancy');
  await expect(results.filter({ hasText: 'Animate Dead' })).toBeVisible();
});

test('the GM browses monsters as pictures and drags one onto the map', async ({ page }) => {
  await atTable(page, GM);
  await page.getByRole('tab', { name: 'Compendium' }).click();
  await page.getByRole('button', { name: 'Monsters', exact: true }).click();
  await page.getByRole('radio', { name: 'Icons' }).click();
  await page.getByRole('searchbox', { name: 'Search monsters…' }).fill('owlbear');

  const owlbear = page.getByRole('button', { name: 'Owlbear', exact: true });
  await expect(owlbear).toBeVisible();
  const before = await idsSeen(page);
  const at = await screenOf(page, 900, 900);
  await owlbear.dragTo(page.locator('.map canvas'), { targetPosition: await onCanvas(page, at) });
  await expect.poll(async () => (await idsSeen(page)).filter((id) => !before.includes(id))).toHaveLength(1);
});

/** A page point as a position inside the map canvas. */
async function onCanvas(page: Page, at: { x: number; y: number }) {
  const box = (await page.locator('.map canvas').boundingBox())!;
  return { x: at.x - box.x, y: at.y - box.y };
}

test.describe('onto a character sheet', () => {
  test.use({ viewport: { width: 1700, height: 950 } });
  test.beforeEach(async ({ page }) => {
    // The sheet opens beside the side panel, as if the GM had put it there last time.
    await page.addInitScript(() =>
      localStorage.setItem('vtt:window-sheet', JSON.stringify({ x: 560, y: 10, w: 600, h: 600 })),
    );
  });

  test('the GM makes Bram a dwarf and starts a wizard level by dropping them on his sheet', async ({ page }) => {
    await atTable(page, GM);
    const bram = await screenOf(page, 650, 650);
    await page.mouse.click(bram.x, bram.y);
    await page.keyboard.press('c');
    const sheet = page.getByRole('region', { name: "Bram's character sheet" });
    await expect(sheet).toBeVisible();

    await page.getByRole('tab', { name: 'Compendium' }).click();
    await page.getByRole('button', { name: 'Species', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Search species…' }).fill('dwarf');
    await page.getByRole('listitem').filter({ hasText: 'Dwarf' }).first().dragTo(sheet);
    await expect.poll(() => page.evaluate(() => vtt.token('bram')?.stats?.species)).toBe('dwarf');
    await expect(sheet.getByText(/Dwarf/).first()).toBeVisible();

    await page.getByRole('button', { name: 'Classes', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Search classes…' }).fill('wizard');
    await page.getByRole('listitem').filter({ hasText: 'Wizard' }).first().dragTo(sheet);
    const levelUp = page.getByRole('dialog', { name: 'Bram: level up' });
    await expect(levelUp).toBeVisible();
    await expect(levelUp.getByRole('combobox', { name: 'Class' })).toHaveText('Wizard');
  });
});
