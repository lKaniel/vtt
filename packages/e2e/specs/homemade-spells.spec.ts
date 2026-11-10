// A homemade spell on a creature with no spellcasting: Bram is a fighter,
// given a spell of his own on his sheet. He casts it at its own level with
// no slot, with his best mental ability (Wisdom).

import type { Page } from '@playwright/test';
import { editActor, placeToken } from '../support/files.ts';
import { expect, test } from '../support/fixtures.ts';
import { screenOf } from '../support/map.ts';
import { PLAYER_2, atTable, chatLog } from '../support/table.ts';

const BRAM: [number, number] = [650, 650];
const GOBLIN: [number, number] = [650, 750];

test.use({
  serverOptions: {
    prepare: async (dir) => {
      await placeToken(dir, 'goblin-1', ...GOBLIN);
      await editActor(dir, 'bram', (bram) => ({
        ...bram,
        own: {
          spells: [
            {
              id: 'sun-glare',
              name: 'Sun Glare',
              level: 1,
              school: 'evocation',
              castingTime: 'action',
              range: 60,
              save: { ability: 'dex', onSave: 'half' },
              damage: [{ dice: '2d6', type: 'radiant' }],
            },
          ],
        },
      }));
    },
  },
});

async function clickOnMap(page: Page, at: [number, number]): Promise<void> {
  const p = await screenOf(page, ...at);
  await page.mouse.click(p.x, p.y);
}

test('a fighter casts his homemade spell without a slot', async ({ page }) => {
  await atTable(page, PLAYER_2);
  await clickOnMap(page, BRAM);
  await page.keyboard.press('c');
  const sheet = page.getByRole('region', { name: "Bram's character sheet" });
  await sheet.getByRole('tab', { name: 'Spells' }).click();
  await expect(sheet).toContainText('without a slot');
  await expect(sheet.getByLabel('Spellcasting')).toContainText('Wisdom');
  await expect(sheet.getByRole('button', { name: 'Cast Sun Glare' })).toBeVisible();
  await page.keyboard.press('c');
  await expect(sheet).toBeHidden();
  await page.getByRole('tab', { name: 'Spells' }).click();
  await page.getByRole('button', { name: /Sun Glare/ }).click();
  await clickOnMap(page, GOBLIN);
  await expect(chatLog(page).getByText(/cast without a spell slot/)).toBeVisible();
});
