// The sidebar lists (Actors here, the others are built the same way):
// folders the GM makes, names, colours and drags actors into, the filters
// and view modes, and the right-click menu that holds every command.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '../support/fixtures.ts';
import { GM, atTable } from '../support/table.ts';

test.describe.configure({ timeout: 90_000 });

const onDisk = async (gameDir: string, rel: string) =>
  JSON.parse(await readFile(join(gameDir, rel), 'utf8').catch(() => '{}')) as Record<string, unknown>;

test('the GM files actors in a new coloured folder by dragging them', async ({ page, server }) => {
  await atTable(page, GM);
  await page.getByRole('tab', { name: 'Actors' }).click();
  const road = page.getByRole('region', { name: 'Road ambush' });
  await expect(road.getByRole('listitem').filter({ hasText: 'Bandit Captain' })).toBeVisible();

  await page.getByRole('button', { name: 'New folder' }).click();
  const name = page.getByRole('textbox', { name: 'Folder name' });
  await name.fill('Wolves');
  await name.press('Enter');
  const wolves = page.getByRole('region', { name: 'Wolves' });
  await expect(wolves).toBeVisible();

  const wolf = page.getByRole('listitem').filter({ hasText: /^Wolf/ });
  await wolf.dragTo(wolves.getByRole('button', { name: /Wolves/ }));
  await expect(wolves.getByRole('listitem').filter({ hasText: 'Wolf' })).toBeVisible();
  await expect.poll(async () => (await onDisk(server.gameDir, 'actors/wolf.json')).folder).toBe('new-folder'); // the id it was made with

  await wolves.getByRole('button', { name: /Wolves/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Colour', exact: true }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Colour 3' }).click();
  await expect.poll(async () => (await onDisk(server.gameDir, 'folders/new-folder.json')).color).toBe('#a68a2c');

  // Closing a folder hides what is in it.
  await wolves.getByRole('button', { name: /Wolves/ }).click();
  await expect(wolves.getByRole('listitem')).toHaveCount(0);
});

test('the GM narrows the Actors list and opens a sheet from the right-click menu', async ({ page }) => {
  await atTable(page, GM);
  await page.getByRole('tab', { name: 'Actors' }).click();
  await page.getByRole('button', { name: 'Filters' }).click();
  await page.getByRole('combobox', { name: 'Type' }).click();
  await page.getByRole('option', { name: /^Characters/ }).click();
  const rows = page.getByRole('listitem');
  await expect(rows.filter({ hasText: 'Bandit' })).toHaveCount(0);
  await expect(rows.filter({ hasText: 'Bram' })).toBeVisible();

  await page.getByRole('radio', { name: 'Icons' }).click();
  await page.getByRole('button', { name: 'Bram', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Open sheet' }).click();
  await expect(page.getByRole('region', { name: "Bram's character sheet" })).toBeVisible();
});
