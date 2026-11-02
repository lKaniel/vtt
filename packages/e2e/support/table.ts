// Getting a browser to the table the way a person does: the join screen,
// the game's page, Enter the game. Reading the table goes through `vtt`,
// the scripting API every open table puts on the page (docs/scripting.md).

import { expect, type Page } from '@playwright/test';

/** The home game in `world/`. */
export const HOME = 'example';

/** The players in `world/game.json`, by their names on screen. */
export const GM = 'GM';
export const PLAYER_2 = 'Player 2';

export interface JoinOptions {
  game?: string;
  password?: string;
}

/** `text` matched literally inside a RegExp. */
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Picks `player` on the game's join screen; lands on the game's page. */
export async function joinGame(page: Page, player: string, options: JoinOptions = {}): Promise<void> {
  const game = options.game ?? HOME;
  await page.goto(`/#/join/${game}`);
  await page.getByRole('combobox', { name: 'Your player' }).click();
  await page.getByRole('option', { name: new RegExp(`^${escapeRegExp(player)} `) }).click();
  if (options.password !== undefined) await page.getByRole('textbox', { name: 'Password' }).fill(options.password);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#/games/${game}$`));
}

/** From the game's page, sits down at the table and waits until `vtt` is ready. */
export async function enterTable(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Enter the game' }).click();
  await expect(page).toHaveURL(/#\/play\//);
  await page.waitForFunction(() => typeof vtt !== 'undefined' && Boolean(vtt.user()));
}

/** Joins as `player` and enters the table. */
export async function atTable(page: Page, player: string, options: JoinOptions = {}): Promise<void> {
  await joinGame(page, player, options);
  await enterTable(page);
}
