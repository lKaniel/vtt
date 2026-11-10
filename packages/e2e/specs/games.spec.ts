// A game's life outside the table: backups, a game as a zip, and a game
// made from a Foundry world.

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { expect, test } from '../support/fixtures.ts';
import { makeFoundryWorld } from '../support/foundry-world.ts';
import { GM, enterTable, joinGame } from '../support/table.ts';

test('Back up now keeps a backup that Restore puts back', async ({ page }) => {
  await joinGame(page, GM);
  const backups = page.getByRole('complementary').getByRole('listitem');
  await page.getByRole('button', { name: 'Back up now' }).click();
  await expect(backups.filter({ hasText: 'by hand' })).toHaveCount(1);

  // A change after the backup: a new player.
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Latecomer');
  await page.getByRole('button', { name: 'Add player' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Latecomer' })).toHaveCount(1);

  page.once('dialog', (dialog) => void dialog.accept());
  await backups.filter({ hasText: 'by hand' }).getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText(/^Restored the game to/)).toBeVisible();
  await expect(backups.filter({ hasText: 'before a restore' })).toHaveCount(1);
  await expect(page.getByRole('listitem').filter({ hasText: 'Latecomer' })).toHaveCount(0);
});

test('a game downloaded as a zip comes back as a new game, players and all', async ({ page }) => {
  await joinGame(page, GM);
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download as zip' }).click();
  const zip = await (await download).path();

  await page.goto('/#/setup');
  await page.locator('input[type=file]').setInputFiles(zip);
  await expect(page).toHaveURL(/#\/games\/example-the-crossroads$/);
  for (const player of ['GM', 'Player 1', 'Player 2']) {
    await expect(page.getByRole('listitem').filter({ hasText: player }).first()).toBeVisible();
  }
  await enterTable(page);
  expect(await page.evaluate(() => vtt.tokens().map((t) => t.id))).toEqual(
    expect.arrayContaining(['bram', 'goblin-1', 'goblin-2', 'orrin', 'vesper']),
  );
});

test('a Foundry world becomes a new game', async ({ page }) => {
  const world = await makeFoundryWorld();
  try {
    await page.goto('/#/setup');
    await page.getByRole('textbox', { name: 'World folder' }).fill(world);
    await page.getByRole('button', { name: 'Import world' }).click();
    await expect(page.getByText(/The Lost Keep\s*is ready: 1 scene, 1 actor, 1 token, 1 journal entry/)).toBeVisible();
    await page.getByRole('button', { name: 'Open the game' }).click();
    await expect(page).toHaveURL(/#\/games\/the-lost-keep$/);
    await expect(page.getByRole('heading', { name: 'The Lost Keep', level: 1 })).toBeVisible();

    await enterTable(page);
    await expect(page.getByRole('banner')).toContainText('The Keep');
    expect(await page.evaluate(() => vtt.tokens().map((t) => t.name))).toContain('Goblin');
    expect(await page.evaluate(() => vtt.docs('journals').map((j) => j.name))).toContain('History');
  } finally {
    await rm(dirname(dirname(dirname(world))), { recursive: true, force: true });
  }
});

test('a Foundry world imported again keeps the scenes made in the VTT', async ({ page, server }) => {
  const world = await makeFoundryWorld();
  try {
    await page.goto('/#/setup');
    await page.getByRole('textbox', { name: 'World folder' }).fill(world);
    await page.getByRole('button', { name: 'Import world' }).click();
    await expect(page.getByRole('button', { name: 'Open the game' })).toBeVisible();
    // A scene built here since (by Claude, in the game's folder).
    const grotto = join(server.dataDir, 'games/the-lost-keep/scenes/sunken-grotto/scene.json');
    await mkdir(dirname(grotto), { recursive: true });
    await writeFile(grotto, JSON.stringify({ name: 'Sunken Grotto' }));

    await page.reload();
    await page.getByRole('combobox', { name: 'Into' }).click();
    await page.getByRole('option', { name: 'The Lost Keep' }).click();
    await page.getByRole('button', { name: 'Import again' }).click();
    await expect(page.getByText(/Kept from this game: \d+ files?, with the scenes Sunken Grotto\./)).toBeVisible();
    await page.getByRole('button', { name: 'Open the game' }).click();
    await enterTable(page);
    expect(await page.evaluate(() => vtt.docs('scenes').map((s) => s.name))).toEqual(
      expect.arrayContaining(['The Keep', 'Sunken Grotto']),
    );
  } finally {
    await rm(dirname(dirname(dirname(world))), { recursive: true, force: true });
  }
});
