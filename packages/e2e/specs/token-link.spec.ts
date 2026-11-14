// Switching a token between linked to its actor (sharing its hit points and
// effects) and an unlinked copy, from the sheet and the right-click menu.

import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.ts';
import { screenOf } from '../support/map.ts';
import { GM, atTable } from '../support/table.ts';

const BRAM: [number, number] = [650, 650];
const linkedOf = (page: Page, id: string) => page.evaluate((id) => vtt.doc('crossroads/tokens', id)?.linked, id);

test('the GM unlinks a token from its sheet and links it back from its menu', async ({ page }) => {
  await atTable(page, GM);
  const p = await screenOf(page, ...BRAM);
  await page.mouse.click(p.x, p.y);
  const id = (await page.evaluate(() => vtt.selected()?.id))!;
  await page.keyboard.press('c');
  const linked = page.getByRole('switch', { name: 'Linked to its actor' });
  await expect(linked).toBeChecked();

  await linked.click();
  await expect(linked).not.toBeChecked();
  await expect.poll(() => linkedOf(page, id)).toBe(false);

  // The sheet closed, the token's own menu links it back.
  await page.keyboard.press('c');
  await expect(linked).toBeHidden();
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Link to actor' }).click();
  await expect.poll(() => linkedOf(page, id)).toBe(true);
});
