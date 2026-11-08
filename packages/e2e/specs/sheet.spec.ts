// The character sheet, laid out like Foundry's: rolling from it, its tabs
// and lists, and the GM's edit mode.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.ts';
import { screenOf } from '../support/map.ts';
import { GM, PLAYER_2, atTable, chatLog } from '../support/table.ts';

const BRAM: [number, number] = [650, 650];

async function openBram(page: Page) {
  const p = await screenOf(page, ...BRAM);
  await page.mouse.click(p.x, p.y);
  await page.keyboard.press('c');
  const sheet = page.getByRole('region', { name: "Bram's character sheet" });
  await expect(sheet).toBeVisible();
  return sheet;
}

test('a player rolls checks, saves and skills from the sheet', async ({ page }) => {
  await atTable(page, PLAYER_2);
  const sheet = await openBram(page);
  await sheet.getByRole('button', { name: 'Strength saving throw' }).click();
  await expect(chatLog(page)).toContainText('STR save');
  await sheet.getByRole('button', { name: 'Dexterity check' }).click();
  await expect(chatLog(page)).toContainText('DEX check');
  await sheet.getByRole('tab', { name: 'Details' }).click();
  await sheet.getByRole('button', { name: /^Athletics/ }).click();
  await expect(chatLog(page)).toContainText('Athletics');
});

test('the inventory lists gear by kind, opens a description in place and filters by name', async ({ page }) => {
  await atTable(page, PLAYER_2);
  const sheet = await openBram(page);
  const armour = sheet.getByRole('region', { name: 'Armour' });
  await expect(armour.getByRole('listitem', { name: 'Chain Mail' })).toBeVisible();
  await expect(armour.getByRole('button', { name: 'Unequip' }).first()).toHaveAttribute('aria-pressed', 'true');
  await sheet.getByRole('button', { name: 'Potion of Healing', exact: true }).click();
  await expect(sheet).toContainText('You regain Hit Points when you drink this potion');
  await sheet.getByRole('searchbox', { name: 'Search' }).fill('cross');
  await expect(sheet.getByRole('listitem', { name: 'Light Crossbow' })).toBeVisible();
  await expect(sheet.getByRole('listitem', { name: 'Chain Mail' })).toHaveCount(0);
});

test('the GM makes a skill proficient in edit mode', async ({ page }) => {
  await atTable(page, GM);
  const sheet = await openBram(page);
  await sheet.getByRole('switch', { name: 'Edit mode (E)' }).click();
  await sheet.getByRole('tab', { name: 'Details' }).click();
  await sheet.getByRole('button', { name: 'Proficient in Athletics' }).click();
  // Strength +3 and proficiency +2.
  await expect(sheet.getByRole('listitem').filter({ hasText: 'Athletics' })).toContainText('+5');
  await sheet.getByRole('switch', { name: 'Edit mode (E)' }).click();
  await expect(sheet.getByRole('tab', { name: 'Token' })).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: /^Athletics/ })).toContainText('+5');
});

test('the GM uploads a picture for a token from the Token tab', async ({ page, server }) => {
  await atTable(page, GM);
  const sheet = await openBram(page);
  await sheet.getByRole('switch', { name: 'Edit mode (E)' }).click();
  await sheet.getByRole('tab', { name: 'Token' }).click();
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  await sheet
    .getByLabel('Upload a picture')
    .setInputFiles({ name: 'Bram Face.png', mimeType: 'image/png', buffer: png });
  await expect(sheet.getByRole('textbox', { name: 'Picture' })).toHaveValue('/assets/uploads/bram-face.png');
  await expect
    .poll(() => page.evaluate(() => vtt.tokens().find((t) => t.name === 'Bram')?.img))
    .toBe('/assets/uploads/bram-face.png');
  expect(existsSync(join(server.gameDir, 'assets/uploads/bram-face.png'))).toBe(true);
});
