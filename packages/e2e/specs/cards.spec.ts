// Cards (docs/game-format.md, card-actions.ts): the GM makes a deck of
// playing cards, a pile and a hand for a player, and deals; the player sees
// only their own hand and plays a card onto the pile for everyone to see.

import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.ts';
import { GM, PLAYER_2, atTable } from '../support/table.ts';

test.describe.configure({ timeout: 90_000 });

/** The stack named `name` in the Cards tab. */
const stack = (page: Page, name: string) => page.getByRole('listitem').filter({ hasText: name });

/** How many cards the table says stack `id` holds. */
/** The open window of stack `name`. */
const opened = (page: Page, name: string) =>
  page.getByRole('dialog').filter({ has: page.getByRole('heading', { name, exact: true }) });

const count = (page: Page, id: string) =>
  page.evaluate((key) => (vtt.doc('cards', key)?.cards as unknown[] | undefined)?.length ?? 0, id);

test('the GM deals from a deck and a player plays a card onto the pile', async ({ page, seat }) => {
  await atTable(page, GM);
  const player = await seat(PLAYER_2);
  await page.getByRole('tab', { name: 'Cards' }).click();
  await page.getByRole('button', { name: 'Playing cards' }).click();
  await page.getByRole('button', { name: 'New pile' }).click();
  await page.getByRole('combobox', { name: 'New hand for…' }).click();
  await page.getByRole('option', { name: 'Player 2’s hand' }).click();
  await expect(stack(page, 'Playing cards')).toContainText('52 cards');

  await stack(page, 'Playing cards').click();
  const deck = opened(page, 'Playing cards');
  await deck.getByRole('textbox', { name: 'Cards to each hand' }).fill('3');
  await deck.getByRole('button', { name: 'Deal to 1 hands' }).click();
  await expect(stack(page, 'Playing cards')).toContainText('49 cards');
  await deck.press('Escape');

  // The player sees their hand and the pile, never the deck's faces.
  await player.getByRole('tab', { name: 'Cards' }).click();
  await expect(stack(player, 'Player 2’s hand')).toContainText('3 cards');
  await stack(player, 'Player 2’s hand').click();
  const hand = opened(player, 'Player 2’s hand');
  const cards = hand.locator('button[aria-pressed]');
  await expect(cards).toHaveCount(3);
  await cards.first().click();
  await hand.getByRole('button', { name: 'Play' }).click();
  await expect(hand.locator('button[aria-pressed]')).toHaveCount(2);

  await expect.poll(() => count(page, 'pile')).toBe(1);
  await expect(stack(page, 'Pile')).toContainText('1 cards');
});
