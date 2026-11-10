import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '../support/fixtures.ts';

// Setup's Packs box: the admin uploads a pack's folder, sees it installed,
// and deletes it again (two clicks).

async function packOnDisk(): Promise<string> {
  const dir = join(await mkdtemp(join(tmpdir(), 'vtt-pack-')), 'forest');
  await mkdir(join(dir, 'media/trees'), { recursive: true });
  await writeFile(join(dir, 'pack.json'), JSON.stringify({ id: 'forest', name: 'Forest' }));
  await writeFile(join(dir, 'media/trees/oak.webp'), 'not really a picture');
  return dir;
}

test('the admin uploads a pack folder and deletes it again', async ({ page }) => {
  await page.goto('/#/setup');
  const box = page.locator('[data-slot="packs"]');
  await expect(box.getByText('No packs installed.')).toBeVisible();
  await box.locator('input[type="file"]').setInputFiles(await packOnDisk());
  await expect(box.getByText('Installed Forest.')).toBeVisible();
  await expect(box.getByText('Forest', { exact: true })).toBeVisible();

  await box.getByRole('button', { name: 'Delete' }).click();
  await box.getByRole('button', { name: 'Delete for good' }).click();
  await expect(box.getByText('Deleted Forest.')).toBeVisible();
  await expect(box.getByText('No packs installed.')).toBeVisible();
});
