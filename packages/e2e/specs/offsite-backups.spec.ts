import { expect, test } from '../support/fixtures.ts';

// Setup's nightly backups off the server: without backup storage it says
// how to set one up; with it, the admin backs up now and restores a game.

test('Setup says when the server keeps no copy of its games elsewhere', async ({ page }) => {
  await page.goto('/#/setup');
  const box = page.locator('[data-slot="offsite-backups"]');
  await expect(box.getByText(/keeps no copy of its games anywhere else/)).toBeVisible();
  await expect(box.getByRole('button', { name: 'Back up now' })).toHaveCount(0);
});

test.describe('with backup storage', () => {
  test.use({ serverOptions: { offsite: true } });

  test('the admin backs every game up now and puts one back from that night', async ({ page }) => {
    await page.goto('/#/setup');
    const box = page.locator('[data-slot="offsite-backups"]');
    await expect(box.getByText(/every game is copied to/)).toBeVisible();
    await box.getByRole('button', { name: 'Back up now' }).click();
    await expect(box.getByText(/^Copied \d+ games?\.$/)).toBeVisible();
    await expect(box.getByText(/^Last copy:/)).toBeVisible();
    await box.getByRole('button', { name: 'Restore' }).first().click();
    await expect(box.getByText(/^Restored .+ to \d{4}-\d{2}-\d{2}\.$/)).toBeVisible();
  });
});
