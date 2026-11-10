// The actions anyone can take besides attacking: Hide rolls Stealth, and
// Grapple seizes the creature it is aimed at in place of one attack.
// goblin-1 is moved next to the party (south of Bram) before the server starts.

import type { Page } from '@playwright/test';
import { placeToken } from '../support/files.ts';
import { expect, test } from '../support/fixtures.ts';
import { screenOf } from '../support/map.ts';
import { PLAYER_2, atTable, chatLog } from '../support/table.ts';

const BRAM: [number, number] = [650, 650];
const GOBLIN: [number, number] = [650, 750];

test.use({ serverOptions: { seed: 20, prepare: (dir) => placeToken(dir, 'goblin-1', ...GOBLIN) } });

async function clickOnMap(page: Page, at: [number, number]): Promise<void> {
  const p = await screenOf(page, ...at);
  await page.mouse.click(p.x, p.y);
}

test('Hide rolls Stealth and tells the table', async ({ page }) => {
  await atTable(page, PLAYER_2);
  await clickOnMap(page, BRAM);
  await page.getByRole('tab', { name: 'Features' }).click();
  await page.getByRole('button', { name: 'Hide', exact: true }).click();
  await expect(chatLog(page).getByText(/Bram uses Hide: Stealth \d+/)).toBeVisible();
});

// Bram plays by the 2024 rules: the goblin saves against 8 + Strength + proficiency.
test('Grapple is aimed at a creature in reach, which resists or is seized', async ({ page }) => {
  await atTable(page, PLAYER_2);
  await clickOnMap(page, BRAM);
  await page.getByRole('tab', { name: 'Features' }).click();
  await page.getByRole('button', { name: 'Grapple', exact: true }).click();
  await clickOnMap(page, GOBLIN);
  await expect(chatLog(page).getByText(/Bram uses Grapple/)).toBeVisible();
  await expect(chatLog(page).getByText(/Goblin: (STR|DEX) save \d+ vs DC \d+, (saved|failed)/)).toBeVisible();
});
