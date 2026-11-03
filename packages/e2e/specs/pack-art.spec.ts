// Turning on asset packs dresses the game with no picking per item: icons
// from a pack's art file on the Compendium and the action bar, monsters in
// the pack's tokens, and attacks played with the animation pack's video.
// The packs are tiny stand-ins (fixtures/packs): drawn icons, and empty
// videos laid out like JB2A's library.

import { cp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Page } from '@playwright/test';
import { editActor, placeToken } from '../support/files.ts';
import { expect, test } from '../support/fixtures.ts';
import { screenOf } from '../support/map.ts';
import { GM, PLAYER_2, atTable } from '../support/table.ts';
import { repoRoot } from '../support/server.ts';

const BRAM: [number, number] = [650, 650];
const GOBLIN: [number, number] = [650, 750];

/** Installs the fixture packs in the server's data folder and turns them on for the game. */
async function withArtPacks(dir: string): Promise<void> {
  const packs = join(dirname(dir), 'data', 'packs');
  await cp(join(repoRoot, 'packages/e2e/fixtures/packs'), packs, { recursive: true });
  const file = join(dir, 'game.json');
  const game = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
  await writeFile(file, JSON.stringify({ ...game, packs: ['e2e-icons', 'e2e-jb2a'] }, null, 2));
  await placeToken(dir, 'goblin-1', ...GOBLIN);
  await editActor(dir, 'goblin', (goblin) => ({ ...goblin, stats: { ac: 1 } }));
}

test.describe.configure({ timeout: 90_000 });
test.use({ serverOptions: { prepare: withArtPacks, seed: 20 } });

async function clickOnMap(page: Page, at: [number, number]): Promise<void> {
  const p = await screenOf(page, ...at);
  await page.mouse.click(p.x, p.y);
}

test('the Compendium shows a spell in the pack’s icon and a monster in the pack’s token', async ({ page }) => {
  await atTable(page, GM);
  await page.getByRole('tab', { name: 'Compendium' }).click();
  await page.getByRole('button', { name: 'Spells', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search spells…' }).fill('fireball');
  const fireball = page.getByRole('listitem').filter({ hasText: 'Fireball' }).first();
  await expect(fireball.locator('img')).toHaveAttribute('src', '/packs/e2e-icons/media/icons/magic/fire.svg');

  await page.getByRole('button', { name: 'Monsters', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search monsters…' }).fill('goblin');
  const goblin = page
    .getByRole('listitem')
    .filter({ hasText: /^Goblin/ })
    .first();
  await expect(goblin.locator('img')).toHaveAttribute('src', '/packs/e2e-icons/media/tokens/humanoid/Goblin.svg');
});

test('a longsword shows the pack’s icon and swings with the pack’s video', async ({ page }) => {
  await atTable(page, PLAYER_2);
  await clickOnMap(page, BRAM);
  const longsword = page.getByRole('button', { name: 'Longsword' });
  await expect(longsword.locator('img')).toHaveAttribute('src', '/packs/e2e-icons/media/icons/weapons/sword.svg');
  const video = page.waitForRequest(/\/packs\/e2e-jb2a\/.*Sword01_01_Regular_White/);
  await longsword.click();
  await clickOnMap(page, GOBLIN);
  await video;
});
