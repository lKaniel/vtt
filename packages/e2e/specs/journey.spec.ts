// The whole way from a new game to its first fight: the admin makes the game
// and invites a player by link, the player makes a character and sits down
// with it, and the GM, guided by the getting-ready card, starts combat.

import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.ts';

/** Makes a character from the creator's last step, fixing what its to-do list names. */
async function makeCharacter(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: /Name & look/ }).click();
  const todo = page.locator('[data-slot="to-finish"]');
  await expect(todo).toContainText('Still to do');
  await todo.getByRole('button', { name: /^Class:/ }).click();
  await page.getByText('Defense', { exact: true }).click();
  await page.getByRole('button', { name: /^\d+\s*Skills/ }).click();
  await page.getByRole('button', { name: /^Athletics Str/ }).click();
  await page.getByRole('button', { name: /^Perception Wis/ }).click();
  await page.getByRole('button', { name: /Name & look/ }).click();
  await expect(todo).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Name' }).fill(name);
  await page.getByRole('button', { name: 'Create character' }).click();
}

test('a new game, from Setup through an invite link to the first fight', async ({ page, browser, server }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/#/setup');
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('The Night Market');
  await page.getByRole('button', { name: 'Create game' }).click();
  await expect(page).toHaveURL(/#\/games\/the-night-market$/);

  // The GM adds a player and copies their invite link.
  await expect(page.getByRole('textbox', { name: 'Invite link' })).toHaveValue(/\/#\/join\/the-night-market$/);
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Alice');
  await page.getByRole('button', { name: 'Add player' }).click();
  await page.getByRole('button', { name: 'Copy Alice’s invite link' }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toBe(`${server.url}/#/join/the-night-market/alice`);

  // The player opens it: their name is picked, one click joins.
  const player = await (await browser.newContext({ baseURL: server.url })).newPage();
  await player.goto(link);
  await expect(player.getByRole('combobox', { name: 'Your player' })).toContainText('Alice');
  await player.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(player).toHaveURL(/#\/games\/the-night-market$/);
  await expect(player.getByText(/You have no character here yet/)).toBeVisible();

  await player.getByRole('button', { name: 'Create a character' }).click();
  await makeCharacter(player, 'Mira');
  await expect(player).toHaveURL(/#\/games\/the-night-market$/);
  // The new character comes along by itself.
  await expect(player.locator('[data-slot="enter-game"]').getByRole('combobox')).toContainText('Mira');
  await player.getByRole('button', { name: 'Enter the game' }).click();
  await player.waitForFunction(() => typeof vtt !== 'undefined' && Boolean(vtt.user()));
  await expect.poll(() => player.evaluate(() => vtt.tokens().map((t) => t.name))).toContain('Mira');

  // The GM sits down to an empty scene: the card says what is left.
  await page.getByRole('button', { name: 'Enter the game' }).click();
  await page.waitForFunction(() => typeof vtt !== 'undefined' && Boolean(vtt.user()));
  const ready = page.getByRole('region', { name: 'Getting the table ready' });
  await expect(ready).toContainText('Players’ characters on the map: 1 of 1');
  await ready.getByRole('button', { name: 'Compendium' }).click();
  await expect(page.getByRole('tab', { name: 'Compendium' })).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('button', { name: 'Start combat' }).click();
  await expect(ready).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'End combat' })).toBeVisible();
  await player.context().close();
});
