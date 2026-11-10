// Spells a player picks for a feature: Orrin is made an 11th-level warlock,
// picks his Mystic Arcanum on the sheet's Features tab, and the spell is
// then cast with the feature instead of a slot.

import { editActor } from '../support/files.ts';
import { expect, test } from '../support/fixtures.ts';
import { screenOf } from '../support/map.ts';
import { PLAYER_1, atTable } from '../support/table.ts';

const ORRIN: [number, number] = [750, 650];

test.describe.configure({ timeout: 90_000 });
test.use({
  serverOptions: {
    prepare: async (dir) => {
      await editActor(dir, 'orrin', (orrin) => ({
        ...orrin,
        stats: {
          class: 'warlock',
          level: 11,
          abilities: { str: 10, dex: 14, con: 14, int: 10, wis: 12, cha: 18 },
          spells: ['eldritch-blast'],
        },
      }));
    },
  },
});

test('a warlock picks a Mystic Arcanum on the sheet and casts it without a slot', async ({ page }) => {
  await atTable(page, PLAYER_1);
  const p = await screenOf(page, ...ORRIN);
  await page.mouse.click(p.x, p.y);
  await page.keyboard.press('c');
  const sheet = page.getByRole('region', { name: /Orrin.s character sheet/ });
  await sheet.getByRole('tab', { name: 'Features' }).click();
  await sheet.getByRole('button', { name: 'Pick the spells for Mystic Arcanum' }).click();
  const picks = page.locator('[data-slot="spell-picks"]');
  await picks.getByRole('combobox', { name: 'Spell 1' }).click();
  await page.getByRole('option', { name: 'True Seeing (6th)' }).click();
  await expect(picks.getByRole('combobox', { name: 'Spell 1' })).toContainText('True Seeing');
  await page.keyboard.press('Escape');

  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Spells' }).click();
  await page.getByRole('button', { name: /True Seeing/ }).click();
  const pay = page.getByRole('group', { name: 'Spell slot' });
  await expect(pay.getByRole('button', { name: /Mystic Arcanum 1\/1/ })).toHaveAttribute('aria-pressed', 'true');
});
