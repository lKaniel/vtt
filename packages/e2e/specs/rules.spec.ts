// The D&D rules as played at the table: attacks, spells, combat and rests.
// goblin-1 is moved next to the party (south of Bram) before the server starts.

import type { Page } from '@playwright/test';
import { editActor, placeToken } from '../support/files.ts';
import { expect, test } from '../support/fixtures.ts';
import { dragOnMap, screenOf } from '../support/map.ts';
import { GM, PLAYER_1, PLAYER_2, atTable, chatLog, healthSeen } from '../support/table.ts';

const BRAM: [number, number] = [650, 650];
const ORRIN: [number, number] = [750, 650];
const GOBLIN: [number, number] = [650, 750];

test.describe.configure({ timeout: 90_000 });
test.use({
  serverOptions: {
    prepare: async (dir) => {
      await placeToken(dir, 'goblin-1', ...GOBLIN);
      await editActor(dir, 'bram', (bram) => ({ ...bram, hp: 10 }));
    },
  },
});

async function clickOnMap(page: Page, at: [number, number]): Promise<void> {
  const p = await screenOf(page, ...at);
  await page.mouse.click(p.x, p.y);
}

test.describe('a weapon attack', () => {
  // Seeded dice, and a goblin whose armour (AC 1) anything but a natural 1 beats.
  test.use({
    serverOptions: {
      seed: 20,
      prepare: async (dir) => {
        await placeToken(dir, 'goblin-1', ...GOBLIN);
        await editActor(dir, 'goblin', (goblin) => ({ ...goblin, stats: { ac: 1 } }));
      },
    },
  });

  test('rolls to hit, and the hit wounds the target', async ({ page }) => {
    await atTable(page, PLAYER_2);
    await clickOnMap(page, BRAM);
    await page.getByRole('button', { name: 'Longsword' }).click();
    await clickOnMap(page, GOBLIN);
    const card = chatLog(page)
      .getByText(/Bram → Goblin, Longsword/)
      .locator('..');
    await expect(card).toHaveCount(1);
    await expect(card).not.toContainText('Miss');
    await expect.poll(() => healthSeen(page, 'goblin-1')).not.toBe('unhurt');
  });
});

test('an attack at empty ground is spent and hits nothing', async ({ page }) => {
  await atTable(page, PLAYER_2);
  await clickOnMap(page, BRAM);
  await page.getByRole('button', { name: 'Longsword' }).click();
  await clickOnMap(page, [BRAM[0] - 20, BRAM[1] - 100]);
  await expect(chatLog(page).getByText(/Bram → nothing, Longsword/)).toBeVisible();
});

test('Magic Missile always hits and spends a spell slot', async ({ page }) => {
  await atTable(page, PLAYER_1);
  await clickOnMap(page, ORRIN);
  await page.getByRole('tab', { name: 'Spells' }).click();
  await page.getByRole('button', { name: 'Magic Missile' }).click();
  const slots = page.getByRole('group', { name: 'Spell slot' });
  await expect(slots.getByRole('button', { name: '1st 4/4' })).toHaveAttribute('aria-pressed', 'true');
  // One click per dart, each once the last has registered.
  for (const left of [2, 1]) {
    await clickOnMap(page, GOBLIN);
    await expect(page.getByText(`Click ${left} more target(s) for Magic Missile`)).toBeVisible();
  }
  await clickOnMap(page, GOBLIN);
  await expect.poll(() => healthSeen(page, 'goblin-1')).not.toBe('unhurt');

  await page.getByRole('button', { name: 'Magic Missile' }).click();
  await expect(slots.getByRole('button', { name: '1st 3/4' })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('an area spell clicked on a creature goes at it, not a walk there', async ({ page }) => {
  await atTable(page, PLAYER_1);
  await clickOnMap(page, ORRIN);
  await page.getByRole('tab', { name: 'Spells' }).click();
  await page.getByRole('button', { name: 'Burning Hands' }).click();
  await expect(page.getByText('Click where Burning Hands goes')).toBeVisible();
  await clickOnMap(page, GOBLIN);
  await expect(chatLog(page).getByText(/Orrin casts Burning Hands/)).toBeVisible();
  expect(await page.evaluate(() => vtt.token('orrin')?.x)).toBe(ORRIN[0]);
});

test('a fight rolls initiative and the turn moves on', async ({ page }) => {
  await atTable(page, GM);
  // One creature at a time: with shared party turns, party members next to
  // each other in the order would all be up together.
  await page.getByRole('button', { name: 'Party acts together' }).click();
  await page.getByRole('button', { name: 'Start combat' }).click();
  await page.getByRole('button', { name: /^Roll initiative/ }).click();
  await expect(chatLog(page).getByText(/Roll for initiative!/)).toBeVisible();
  const order = page.getByRole('button', { name: /: initiative \d+$/ });
  await expect(order).toHaveCount(4);

  // The GM is handed whoever is up, first in initiative order.
  const labels = await order.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));
  const names = labels.map((label) => label.split(':')[0]?.trim());
  const upNow = page.getByRole('contentinfo').getByRole('button', { name: /✎/ });
  await expect(upNow).toContainText(names[0] ?? '');
  await page.getByRole('button', { name: 'End turn' }).click();
  await expect(upNow).toContainText(names[1] ?? '');

  await page.getByRole('button', { name: 'End combat' }).click();
  await expect(order).toHaveCount(0);
});

test('the GM chooses who fights before rolling initiative', async ({ page }) => {
  await atTable(page, GM);
  await page.getByRole('button', { name: 'Start combat' }).click();
  const goblin = page.getByRole('checkbox', { name: /Goblin/ }).first();
  await expect(goblin).toBeChecked();
  await goblin.click();
  await page.getByRole('button', { name: 'Roll initiative (3)' }).click();
  await expect(page.getByRole('button', { name: /: initiative \d+$/ })).toHaveCount(3);
  await expect(page.getByRole('button', { name: /^Goblin.*: initiative/ })).toHaveCount(0);
});

test('a slip of the mouse over empty ground keeps your creature; Deselect lets it go', async ({ page }) => {
  await atTable(page, PLAYER_2);
  await clickOnMap(page, BRAM);
  await expect.poll(() => page.evaluate(() => vtt.selected()?.id)).toBe('bram');
  await dragOnMap(page, [1000, 300], [1150, 400]);
  expect(await page.evaluate(() => vtt.selected()?.id)).toBe('bram');
  await page.getByRole('button', { name: 'Deselect' }).click();
  await expect.poll(() => page.evaluate(() => vtt.selected()?.id)).toBeUndefined();
});

test('a long rest heals the party', async ({ page, seat }) => {
  await atTable(page, GM);
  const player = await seat(PLAYER_2);
  await expect(player.getByRole('button', { name: 'Bram 10/28' })).toBeVisible();
  await page.getByRole('button', { name: 'Rest' }).click();
  await page.getByRole('button', { name: /^Long rest/ }).click();
  await expect(player.getByRole('button', { name: 'Bram 28/28' })).toBeVisible();
});

test("a player opens their character's sheet with C", async ({ page }) => {
  await atTable(page, PLAYER_2);
  await clickOnMap(page, BRAM);
  await page.keyboard.press('c');
  const sheet = page.getByRole('region', { name: "Bram's character sheet" });
  await expect(sheet.getByRole('heading', { name: 'Bram' })).toBeVisible();
  await expect(sheet).toContainText('Level 3 Fighter');
  await expect(sheet.getByTitle('Strength')).toContainText('16');
  await expect(sheet.getByTitle('Hit points: 10/28')).toBeVisible();
  await expect(sheet.getByRole('tab', { name: 'Inventory' })).toHaveAttribute('aria-selected', 'true');
  await sheet.getByRole('button', { name: 'Close (C)' }).click();
  await expect(sheet).toHaveCount(0);
});
