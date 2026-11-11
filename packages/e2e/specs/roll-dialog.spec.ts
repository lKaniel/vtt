// The roll dialog: what a player does that rolls or spends part of the turn
// waits for their picks first. goblin-1 stands next to Bram, with armour
// (AC 1) anything but a natural 1 beats.

import type { Page } from '@playwright/test';
import { editActor, placeToken } from '../support/files.ts';
import { expect, test } from '../support/fixtures.ts';
import { screenOf } from '../support/map.ts';
import { GM, PLAYER_1, PLAYER_2, atTable, chatLog, healthSeen } from '../support/table.ts';

const BRAM: [number, number] = [650, 650];
const ORRIN: [number, number] = [750, 650];
const GOBLIN: [number, number] = [650, 750];

test.describe.configure({ timeout: 90_000 });
test.use({
  rollDialog: 'on',
  serverOptions: {
    seed: 20,
    prepare: async (dir) => {
      await placeToken(dir, 'goblin-1', ...GOBLIN);
      await editActor(dir, 'goblin', (goblin) => ({ ...goblin, stats: { ac: 1 } }));
    },
  },
});

async function clickOnMap(page: Page, at: [number, number]): Promise<void> {
  const p = await screenOf(page, ...at);
  await page.mouse.click(p.x, p.y);
}

/** Readies Bram's longsword at the goblin: the dialog opens. */
async function swing(page: Page) {
  await clickOnMap(page, BRAM);
  await page.getByRole('button', { name: 'Longsword' }).click();
  await clickOnMap(page, GOBLIN);
  const dialog = page.getByRole('dialog', { name: 'Longsword' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('an attack waits for the dialog, and rolls with what was picked', async ({ page }) => {
  await atTable(page, PLAYER_2);
  const dialog = await swing(page);
  await expect(dialog).toContainText('At Goblin');
  await expect(dialog).toContainText('As things stand: Normal');
  await expect(chatLog(page).getByText(/Bram → Goblin, Longsword/)).toHaveCount(0);

  await dialog.getByRole('radiogroup', { name: 'Roll' }).getByRole('radio', { name: 'Advantage', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Situational' }).fill('+2');
  await dialog.getByRole('textbox', { name: 'Set damage to' }).fill('3');
  await dialog.getByRole('button', { name: 'Roll', exact: true }).click();

  await expect(dialog).toBeHidden();
  const card = chatLog(page)
    .getByText(/Bram → Goblin, Longsword/)
    .locator('..');
  await expect(card).toContainText('rolled with advantage (picked)');
  await expect(card).toContainText('situational +2');
  await expect(card).toContainText('damage set to 3');
  await expect.poll(() => healthSeen(page, 'goblin-1')).not.toBe('unhurt');
});

test('closing the dialog sends nothing, and a modifier that is not dice cannot be rolled', async ({ page }) => {
  await atTable(page, PLAYER_2);
  const dialog = await swing(page);
  await dialog.getByRole('textbox', { name: 'Situational' }).fill('lots');
  await expect(dialog.getByRole('button', { name: 'Roll', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(chatLog(page).getByText(/Bram → Goblin, Longsword/)).toHaveCount(0);
});

test('turning the dialog off in it rolls at once from then on', async ({ page }) => {
  await atTable(page, PLAYER_2);
  const dialog = await swing(page);
  await dialog.getByRole('switch', { name: 'Ask every time' }).click();
  await dialog.getByRole('button', { name: 'Roll', exact: true }).click();
  await expect(chatLog(page).getByText(/Bram → Goblin, Longsword/)).toHaveCount(1);

  await clickOnMap(page, BRAM);
  await page.getByRole('button', { name: 'Longsword' }).click();
  await clickOnMap(page, GOBLIN);
  await expect(chatLog(page).getByText(/Bram → Goblin, Longsword/)).toHaveCount(2);
  await expect(page.getByRole('dialog', { name: 'Longsword' })).toHaveCount(0);
});

test('a spell in a fight asks what it spends and what pays for it', async ({ page, seat }) => {
  test.slow();
  await atTable(page, PLAYER_1);
  const gm = await seat(GM);
  await gm.getByRole('button', { name: 'Start combat' }).click();
  await gm.getByRole('button', { name: /^Roll initiative/ }).click();
  await expect(chatLog(page).getByText(/Roll for initiative!/)).toBeVisible();

  await clickOnMap(page, ORRIN);
  await page.getByRole('tab', { name: 'Spells' }).click();
  await page.getByRole('button', { name: 'Magic Missile' }).click();
  // The slot is asked in the dialog, not in the bar first.
  await expect(page.getByRole('group', { name: 'Spell slot' })).toHaveCount(0);
  for (const left of [2, 1]) {
    await clickOnMap(page, GOBLIN);
    await expect(page.getByText(`Click ${left} more target(s) for Magic Missile`)).toBeVisible();
  }
  await clickOnMap(page, GOBLIN);

  const dialog = page.getByRole('dialog', { name: 'Cast Magic Missile' });
  await expect(dialog).toContainText('Usually Action');
  // Magic Missile never rolls to hit: there is no d20 to pick.
  await expect(dialog.getByRole('radiogroup', { name: 'Roll' })).toHaveCount(0);
  await expect(dialog.getByRole('combobox', { name: 'Pay with' })).toContainText('1st level slot (4 left)');
  await dialog.getByRole('radiogroup', { name: 'Spend' }).getByRole('radio', { name: 'Nothing' }).click();
  await dialog.getByRole('textbox', { name: 'Extra damage' }).fill('1d4');
  await dialog.getByRole('button', { name: 'Go', exact: true }).click();

  await expect(chatLog(page).getByText(/no action spent \(picked\)/)).toBeVisible();
  await expect(chatLog(page).getByText(/extra damage \+1d4/)).toBeVisible();
});

test('the slot is picked in the dialog, not in a bar before it', async ({ page }) => {
  await atTable(page, PLAYER_1);
  await clickOnMap(page, ORRIN);
  await page.getByRole('tab', { name: 'Spells' }).click();
  await page.getByRole('button', { name: 'Magic Missile' }).click();
  await expect(page.getByRole('group', { name: 'Spell slot' })).toHaveCount(0);
  for (let dart = 0; dart < 3; dart++) await clickOnMap(page, GOBLIN);

  const dialog = page.getByRole('dialog', { name: 'Cast Magic Missile' });
  await dialog.getByRole('combobox', { name: 'Pay with' }).click();
  await page.getByRole('option', { name: /2nd level slot/ }).click();
  await dialog.getByRole('button', { name: 'Go', exact: true }).click();
  // A 2nd-level slot throws a fourth dart, at the creature picked first.
  await expect(chatLog(page)).toContainText('Magic Missile (level 2');
});
