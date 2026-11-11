// The GM runs a fight by hand from the turn order bar: gives the turn to a
// creature, ends it for them, steps back and on, moves a creature in the
// order, sets the round, and takes a creature out of the fight.

import { expect, test } from '../support/fixtures.ts';
import { GM, atTable, chatLog } from '../support/table.ts';

test('the GM runs the fight by hand from the turn order', async ({ page }) => {
  await atTable(page, GM);
  await page.getByRole('button', { name: 'Start combat' }).click();
  await page.getByRole('button', { name: /^Roll initiative/ }).click();
  const order = page.getByRole('button', { name: /: initiative -?\d+$/ });
  const current = page.locator('.turn.current');
  await expect(current).toHaveCount(1);
  const nameOf = (label: string | null) => label!.split(':')[0]!.trim();
  const first = nameOf(await order.first().getAttribute('aria-label'));
  const last = nameOf(await order.last().getAttribute('aria-label'));
  const menu = page.locator('[data-slot="initiative-edit"]');

  // A right click on a portrait opens its menu; the turn goes to that creature.
  await order.last().click({ button: 'right' });
  await menu.getByRole('button', { name: 'Take the turn now' }).click();
  await expect(current).toHaveAttribute('aria-label', new RegExp(`^${last}:`));
  await expect(chatLog(page).getByText(`The GM makes it ${last}'s turn (round 1)`)).toBeVisible();

  // Its turn ended for it: round 2 starts at the top of the order.
  await page.getByRole('button', { name: `Change ${last}’s initiative` }).click();
  await menu.getByRole('button', { name: 'End turn' }).click();
  await expect(current).toHaveAttribute('aria-label', new RegExp(`^${first}:`));
  await expect(page.locator('.round-number')).toHaveText('2');

  // A step back, and on again.
  await page.getByRole('button', { name: 'Previous turn' }).click();
  await expect(current).toHaveAttribute('aria-label', new RegExp(`^${last}:`));
  await expect(page.locator('.round-number')).toHaveText('1');
  await page.getByRole('button', { name: 'Next turn' }).click();
  await expect(current).toHaveAttribute('aria-label', new RegExp(`^${first}:`));

  // The last creature moved up to the front of the order; the turn stays.
  const count = await order.count();
  await order.last().click({ button: 'right' });
  for (let i = 1; i < count; i++) await menu.getByRole('button', { name: `Move ${last} earlier in the order` }).click();
  await expect(order.first()).toHaveAttribute('aria-label', new RegExp(`^${last}:`));
  await expect(current).toHaveAttribute('aria-label', new RegExp(`^${first}:`));

  // Out of the fight.
  await menu.getByRole('button', { name: 'Remove from fight' }).click();
  await expect(order).toHaveCount(count - 1);

  // The round set by hand.
  await page.getByRole('button', { name: 'Change the round' }).click();
  await page.getByRole('textbox', { name: 'Round' }).fill('7');
  await page.getByRole('button', { name: 'Set', exact: true }).click();
  await expect(page.locator('.round-number')).toHaveText('7');
});
