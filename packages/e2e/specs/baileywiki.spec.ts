import {
  startFakeBaileywiki,
  townCompendium,
  GOOD_CODE,
  type FakeBaileywiki,
} from '../../server/src/test/fake-baileywiki.ts';
import { expect, test as base } from '../support/fixtures.ts';

// Setup's Baileywiki box: the admin signs the server in with the code from
// Baileywiki's site (here a stand-in server), picks a scene from the online
// compendia and downloads it into the private Baileywiki pack.

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
