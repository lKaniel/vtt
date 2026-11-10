// Starting a fight: the GM marks a side as surprised, and a legendary
// creature carries its legendary-action counter on the turn order.

import { expect, test } from '../support/fixtures.ts';
import { editActor, placeToken } from '../support/files.ts';
import { GM, atTable, chatLog } from '../support/table.ts';

test('the GM catches a side by surprise as the fight starts', async ({ page }) => {
  await atTable(page, GM);
  await page.getByRole('button', { name: 'Start combat' }).click();
  await page.getByRole('radio', { name: 'Party' }).click();
  await page.getByRole('button', { name: /^Roll initiative/ }).click();
  await expect(chatLog(page).getByText(/Roll for initiative!/)).toBeVisible();
  // Each party member loses its first turn (the world plays 2014 rules).
  const lost = chatLog(page).getByText(/is surprised and loses this turn/);
  for (let turn = 0; turn < 4 && !(await lost.count()); turn++) {
    await page.getByRole('button', { name: 'End turn' }).click();
  }
  await expect(lost.first()).toBeVisible();
});

test.describe('a dragon in the fight', () => {
  test.use({
    serverOptions: {
      prepare: async (dir: string) => {
        await editActor(dir, 'innkeeper', (a) => ({ ...a, name: 'Cinder', monster: 'adult-black-dragon' }));
        await placeToken(dir, 'innkeeper', 900, 1000);
      },
    },
  });

  test('shows its legendary actions left on the turn order', async ({ page }) => {
    await atTable(page, GM);
    await page.getByRole('button', { name: 'Start combat' }).click();
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await page.getByRole('button', { name: /^Roll initiative/ }).click();
    const counter = page.getByRole('button', { name: /Cinder: 3 of 3 legendary actions left/ });
    await expect(counter).toBeVisible();
    await counter.click();
    await expect(page.getByRole('button', { name: /Wing Attack/ })).toBeVisible();
  });
});
