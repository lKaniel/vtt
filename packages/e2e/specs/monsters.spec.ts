// A monster's stat block on its sheet: what it is, its breath weapon with
// its recharge, its other speeds and languages, and the traits the GM runs.

import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.ts';
import { editActor, placeToken } from '../support/files.ts';
import { screenOf } from '../support/map.ts';
import { GM, atTable } from '../support/table.ts';

/** Out on the road, clear of the bars and panels. */
const SPOT: [number, number] = [900, 1000];

/** The innkeeper turns out to be `monster`. */
const disguised = (name: string, monster: string) => async (dir: string) => {
  await editActor(dir, 'innkeeper', (a) => ({ ...a, name, monster }));
  await placeToken(dir, 'innkeeper', ...SPOT);
};

async function openSheet(page: Page, name: string) {
  const p = await screenOf(page, ...SPOT);
  await page.mouse.click(p.x, p.y);
  await page.keyboard.press('c');
  const sheet = page.getByRole('region', { name: `${name}'s character sheet` });
  await expect(sheet).toBeVisible();
  return sheet;
}

test.describe('a dragon', () => {
  test.use({ serverOptions: { prepare: disguised('Cinder', 'adult-red-dragon') } });

  test('shows what it is, its breath weapon and how it moves', async ({ page }) => {
    await atTable(page, GM);
    const sheet = await openSheet(page, 'Cinder');
    await expect(sheet).toContainText(/Adult Red Dragon · dragon · CR 17/i);
    await sheet.getByRole('tab', { name: 'Features' }).click();
    await expect(sheet.getByRole('listitem', { name: 'Fire Breath' })).toContainText('Recharge 5–6');
    await expect(sheet.getByRole('listitem', { name: 'Frightful Presence' })).toBeVisible();
    await sheet.getByRole('tab', { name: 'Details' }).click();
    const block = sheet.getByRole('region', { name: 'Stat block' });
    await expect(block).toContainText('Climb 40 ft, fly 80 ft');
    await expect(block).toContainText('Common, Draconic');
    await expect(block).toContainText('Attacks per action');
  });
});

test.describe('a wolf', () => {
  test.use({ serverOptions: { prepare: disguised('Greyback', 'wolf') } });

  test('lists the traits the GM runs', async ({ page }) => {
    await atTable(page, GM);
    const sheet = await openSheet(page, 'Greyback');
    await sheet.getByRole('tab', { name: 'Features' }).click();
    const traits = sheet.getByRole('region', { name: 'Traits' });
    await expect(traits).toContainText('Pack Tactics');
    await expect(traits).toContainText('advantage on attack rolls');
  });
});
