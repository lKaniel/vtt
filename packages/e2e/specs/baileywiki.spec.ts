import {
  startFakeBaileywiki,
  townCompendium,
  GOOD_CODE,
  type FakeBaileywiki,
} from '../../server/src/test/fake-baileywiki.ts';
import { contentModuleZip } from '../../server/src/test/fake-content-module.ts';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test as base } from '../support/fixtures.ts';
import { GM, atTable } from '../support/table.ts';

// Setup's Baileywiki box: the admin signs the server in with the code from
// Baileywiki's site (here a stand-in server), picks a scene from the online
// compendia and downloads it into the private Baileywiki pack.

const LAMP =
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="5" fill="gold"/></svg>';

const test = base.extend<{ baileywiki: FakeBaileywiki }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright reads a fixture's needs from its first argument
  baileywiki: async ({}, use) => {
    const fake = await startFakeBaileywiki();
    townCompendium(fake);
    await use(fake);
    await fake.close();
  },
  serverOptions: async ({ baileywiki }, use) => {
    await use({ baileywiki: baileywiki.base });
  },
});

test('the admin signs in to Baileywiki and downloads a scene into its pack', async ({ page }) => {
  await page.goto('/#/setup');
  const box = page.getByRole('region', { name: 'Baileywiki' });
  await expect(box.getByRole('link', { name: 'Open the Baileywiki sign-in' })).toBeVisible();
  await box.getByLabel('Code').fill('not it');
  await box.getByRole('button', { name: 'Sign in' }).click();
  await expect(box.getByText(/didn't accept that code/)).toBeVisible();

  await box.getByLabel('Code').fill(GOOD_CODE);
  await box.getByRole('button', { name: 'Sign in' }).click();
  await expect(box.getByText('Signed in: standard membership.')).toBeVisible();

  await box.getByRole('button', { name: 'Show scenes' }).click();
  await box.getByRole('checkbox', { name: 'Town Square' }).click();
  await box.getByRole('button', { name: 'Import 1 scenes' }).click();
  await expect(box.getByTestId('baileywiki-report')).toContainText(
    '1 scenes in the Baileywiki pack, 2 files downloaded.',
  );
  await expect(box.getByText('in the pack')).toBeVisible();
});

test('the GM imports a Baileywiki scene straight into the game from the Assets tab', async ({ page, server }) => {
  await atTable(page, GM);
  await page.getByRole('tab', { name: 'Assets' }).click();
  await page.getByRole('button', { name: 'Baileywiki' }).click();
  const view = page.getByRole('region', { name: 'Baileywiki' });
  await view.getByRole('button', { name: 'Account and online scenes' }).click();
  await view.getByLabel('Code').fill(GOOD_CODE);
  await view.getByRole('button', { name: 'Sign in' }).click();
  await view.getByRole('button', { name: 'Show scenes' }).click();
  await view.getByRole('checkbox', { name: 'Town Square' }).click();
  await view.getByRole('button', { name: 'Import 1 scenes' }).click();
  await expect(view.getByTestId('baileywiki-report')).toContainText('1 scenes');

  const scene = join(server.gameDir, 'scenes/town-square/scene.json');
  await expect
    .poll(() =>
      readFile(scene, 'utf8').then(
        (text) => text.includes('Town Square'),
        () => false,
      ),
    )
    .toBe(true);
  const game = JSON.parse(await readFile(join(server.gameDir, 'game.json'), 'utf8')) as { packs?: string[] };
  expect(game.packs).toContain('baileywiki');
});

test('the GM downloads Baileywiki’s library and places a prefab, its picture fetched from Baileywiki', async ({
  page,
  server,
  baileywiki,
}) => {
  baileywiki.files.set('module.zip', await contentModuleZip());
  baileywiki.files.set('modules/baileywiki-maps/thumbs/lamp.svg', Buffer.from(LAMP));
  await atTable(page, GM);
  await page.getByRole('tab', { name: 'Assets' }).click();
  await page.getByRole('button', { name: 'Baileywiki' }).click();
  const view = page.getByRole('region', { name: 'Baileywiki' });
  await view.getByRole('button', { name: 'Download Baileywiki’s library' }).click();
  await expect(view.getByText('Sign in to Baileywiki below first.')).toBeVisible();
  await view.getByLabel('Code').fill(GOOD_CODE);
  await view.getByRole('button', { name: 'Sign in' }).click();
  await expect(view.getByText(/Signed in/)).toBeVisible();
  await view.getByRole('button', { name: 'Download Baileywiki’s library' }).click();

  const library = page.getByRole('region', { name: 'Baileywiki library' });
  const lamp = library.getByRole('button', { name: 'Street Lamp' });
  await expect(lamp).toBeVisible();
  await expect.poll(() => lamp.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await lamp.click();
  await expect
    .poll(() => readFile(join(server.gameDir, 'scenes/crossroads/tiles.json'), 'utf8'))
    .toContain('pack://baileywiki/media/modules/baileywiki-maps/maps/lamp.webp');
});
