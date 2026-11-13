// The character sheet, laid out like Foundry's: rolling from it, its tabs
// and lists, and the GM's edit mode.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.ts';
import { screenOf } from '../support/map.ts';
import { GM, PLAYER_2, atTable, chatLog } from '../support/table.ts';

const BRAM: [number, number] = [650, 650];
/** A one-pixel picture to upload. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

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

test('a lit torch shows on the Effects tab with the game time it has left', async ({ page }) => {
  await atTable(page, PLAYER_2);
  await page.evaluate(() => vtt.send({ t: 'useItem', token: 'bram', item: 'torch' }));
  const sheet = await openBram(page);
  await sheet.getByRole('tab', { name: 'Effects' }).click();
  const torch = sheet.getByRole('listitem', { name: 'Torch' });
  await expect(torch).toContainText(/(1 h|59 min) left/);
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
  await sheet
    .getByLabel('Upload a picture')
    .setInputFiles({ name: 'Bram Face.png', mimeType: 'image/png', buffer: PNG });
  await expect(sheet.getByRole('textbox', { name: 'Picture' })).toHaveValue('/assets/uploads/bram-face.png');
  await expect
    .poll(() => page.evaluate(() => vtt.tokens().find((t) => t.name === 'Bram')?.img))
    .toBe('/assets/uploads/bram-face.png');
  expect(existsSync(join(server.gameDir, 'assets/uploads/bram-face.png'))).toBe(true);
});

test('a player sets their own token’s picture, but not its size', async ({ page, server }) => {
  await atTable(page, PLAYER_2);
  const sheet = await openBram(page);
  await sheet.getByRole('switch', { name: 'Edit mode (E)' }).click();
  await sheet.getByRole('tab', { name: 'Token' }).click();
  await expect(sheet.getByText('Size', { exact: true })).toHaveCount(0);
  await sheet.getByLabel('Upload a picture').setInputFiles({ name: 'mine.png', mimeType: 'image/png', buffer: PNG });
  await expect(sheet.getByRole('textbox', { name: 'Picture' })).toHaveValue('/assets/uploads/mine.png');
  await expect
    .poll(() => page.evaluate(() => vtt.tokens().find((t) => t.name === 'Bram')?.img))
    .toBe('/assets/uploads/mine.png');
  expect(existsSync(join(server.gameDir, 'assets/uploads/mine.png'))).toBe(true);
});

test('the GM gives heroic inspiration and takes it back', async ({ page }) => {
  await atTable(page, GM);
  const sheet = await openBram(page);
  const inspiration = sheet.getByRole('button', { name: 'Heroic inspiration' });
  await expect(inspiration).toHaveAttribute('aria-pressed', 'false');
  await inspiration.click();
  await expect(inspiration).toHaveAttribute('aria-pressed', 'true');
  await inspiration.click();
  await expect(inspiration).toHaveAttribute('aria-pressed', 'false');
});

test('the GM edits a carried weapon from its attack row, typing the dice on a Ukrainian layout', async ({ page }) => {
  await atTable(page, GM);
  const sheet = await openBram(page);
  const attacks = sheet.getByRole('region', { name: 'Attacks' });
  await attacks.getByRole('button', { name: 'Edit Longsword' }).click();
  const editor = page.getByRole('dialog', { name: /Longsword/ });
  await editor.getByLabel('Damage dice').fill('1в10');
  await editor.getByRole('button', { name: 'Close' }).click();
  // Strength +3 on top of the d10, read the way it rolls.
  await expect(attacks.getByRole('listitem', { name: 'Longsword' })).toContainText('1d10+3');
});

test("the GM adds a campaign skill and it rolls from every sheet's skills", async ({ page }) => {
  await atTable(page, GM);
  await page.getByRole('tab', { name: 'Compendium' }).click();
  await page.getByRole('button', { name: 'Homebrew' }).click();
  await page.getByRole('textbox', { name: 'New skill name' }).fill('Psychic Resistance');
  await page.getByRole('button', { name: 'New skill' }).click();
  await expect(page.getByRole('combobox', { name: 'Ability Psychic Resistance uses' })).toHaveText('Wisdom');

  const sheet = await openBram(page);
  await sheet.getByRole('tab', { name: 'Details' }).click();
  await sheet.getByRole('button', { name: /^Psychic Resistance/ }).click();
  await expect(chatLog(page)).toContainText('Psychic Resistance');

  // This character rolls it with a typed bonus instead of Wisdom.
  await sheet.getByRole('switch', { name: 'Edit mode (E)' }).click();
  await sheet.getByRole('combobox', { name: 'Ability for Psychic Resistance' }).click();
  await page.getByRole('option', { name: 'Typed bonus' }).click();
  await sheet.getByRole('textbox', { name: 'Psychic Resistance bonus' }).fill('7');
  await sheet.getByRole('textbox', { name: 'Psychic Resistance bonus' }).press('Tab');
  await expect(sheet.getByRole('button', { name: /^Psychic Resistance\s*\+7/ })).toBeVisible();
});
