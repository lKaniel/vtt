// Choosing what pays for a cast: a slot of some level, or a feature that
// casts the spell without one. Orrin is made a 2024 ranger, whose Favored
// Enemy gives two free Hunter's Marks; goblin-1 stands next to the party.

import type { Page } from '@playwright/test';
import { editActor, placeToken } from '../support/files.ts';
import { expect, test } from '../support/fixtures.ts';
import { screenOf } from '../support/map.ts';
import { PLAYER_1, atTable, chatLog } from '../support/table.ts';

const ORRIN: [number, number] = [750, 650];
const GOBLIN: [number, number] = [650, 750];

test.describe.configure({ timeout: 90_000 });
test.use({
  serverOptions: {
    prepare: async (dir) => {
      await placeToken(dir, 'goblin-1', ...GOBLIN);
      await editActor(dir, 'orrin', (orrin) => ({
        ...orrin,
        stats: {
          rules: '2024',
          class: 'ranger',
          level: 3,
          abilities: { str: 10, dex: 16, con: 14, int: 10, wis: 14, cha: 8 },
          spells: ['cure-wounds'],
        },
      }));
    },
  },
});

async function clickOnMap(page: Page, at: [number, number]): Promise<void> {
  const p = await screenOf(page, ...at);
  await page.mouse.click(p.x, p.y);
}

test('a spell is cast with a feature’s free use first, or with a slot when picked', async ({ page }) => {
  await atTable(page, PLAYER_1);
  await clickOnMap(page, ORRIN);
  await page.getByRole('tab', { name: 'Spells' }).click();
  const mark = page.getByRole('button', { name: /Hunter.s Mark/ });
  const pay = page.getByRole('group', { name: 'Spell slot' });

  await mark.click();
  await expect(pay.getByRole('button', { name: 'Favored Enemy 2/2' })).toHaveAttribute('aria-pressed', 'true');
  await expect(pay.getByRole('button', { name: '1st 3/3' })).toHaveAttribute('aria-pressed', 'false');
  await clickOnMap(page, GOBLIN);
  await expect(chatLog(page).getByText(/cast with Favored Enemy/)).toBeVisible();

  await mark.click();
  await expect(pay.getByRole('button', { name: 'Favored Enemy 1/2' })).toBeVisible();
  await pay.getByRole('button', { name: '1st 3/3' }).click();
  await clickOnMap(page, GOBLIN);
  await mark.click();
  await expect(pay.getByRole('button', { name: '1st 2/3' })).toBeVisible();
  await expect(pay.getByRole('button', { name: 'Favored Enemy 1/2' })).toHaveAttribute('aria-pressed', 'true');
});
