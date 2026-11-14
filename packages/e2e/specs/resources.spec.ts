// Everything a creature spends (slots, feature uses, hit dice, an item's
// charges, a class's points) is set the same way on the sheet in edit mode.

import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.ts';
import { editActor } from '../support/files.ts';
import { screenOf } from '../support/map.ts';
import { PLAYER_2, atTable } from '../support/table.ts';

const BRAM: [number, number] = [650, 650];

const withWand = (dir: string) =>
  editActor(dir, 'bram', (a) => ({
    ...a,
    inventory: [...(a.inventory as object[]), { item: 'wand-of-magic-missiles', qty: 1, equipped: true }],
  }));

test.use({ serverOptions: { prepare: withWand } });

async function bramInEditMode(page: Page) {
  const p = await screenOf(page, ...BRAM);
  await page.mouse.click(p.x, p.y);
  await page.keyboard.press('c');
  const sheet = page.getByRole('region', { name: "Bram's character sheet" });
  await sheet.getByRole('switch', { name: 'Edit mode (E)' }).click();
  return sheet;
}

const bramSpent = (page: Page) =>
  page.evaluate(() => {
    const bram = vtt.tokens().find((t) => t.name === 'Bram');
    return { spent: bram?.spent, wand: bram?.inventory?.find((e) => e.item === 'wand-of-magic-missiles')?.spent };
  });

test('a player sets their hit dice, feature uses and wand charges left in edit mode', async ({ page }) => {
  await atTable(page, PLAYER_2);
  const sheet = await bramInEditMode(page);
  await sheet.getByRole('button', { name: 'Hit dice 2' }).click();
  await sheet.getByRole('button', { name: 'Wand of Magic Missiles charges 4' }).click();
  await sheet.getByRole('tab', { name: 'Features' }).click();
  await sheet.getByRole('button', { name: 'Second Wind 1' }).click();
  await expect.poll(() => bramSpent(page)).toEqual({ spent: { hitDice: 2, uses: { 'second-wind': 2 } }, wand: 4 });
});

test.describe('a class with a point pool', () => {
  /** A homebrew class whose Lucidity pool holds 20 points at 3rd level. */
  const POOL_CLASS = {
    id: 'mesmer',
    name: 'Mesmer',
    hitDie: 8,
    saves: ['wis', 'int'],
    pool: {
      id: 'lucidity',
      name: 'Lucidity',
      ability: 'wis',
      recharge: 'short',
      max: [
        [1, 12],
        [3, 20],
      ],
    },
    features: [],
  };
  const asMesmer = (dir: string) =>
    editActor(dir, 'bram', (a) => ({
      ...a,
      stats: { ...(a.stats as object), class: 'mesmer' },
      own: { classes: [POOL_CLASS] },
    }));
  test.use({ serverOptions: { prepare: asMesmer } });

  test('a player sets the points left in their pool in edit mode', async ({ page }) => {
    await atTable(page, PLAYER_2);
    const sheet = await bramInEditMode(page);
    await sheet.getByRole('tab', { name: 'Features' }).click();
    await sheet.getByRole('textbox', { name: 'Lucidity' }).fill('13');
    await expect.poll(() => bramSpent(page)).toEqual({ spent: { pool: 7 }, wand: undefined });
    await sheet.getByRole('switch', { name: 'Edit mode (E)' }).click();
    await expect(sheet.getByText('Lucidity 13/20')).toBeVisible();
  });
});
