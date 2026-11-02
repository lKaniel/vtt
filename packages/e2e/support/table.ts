// Getting a browser to the table the way a person does: the join screen,
// the game's page, Enter the game. Reading the table goes through `vtt`,
// the scripting API every open table puts on the page (docs/scripting.md).

import { expect, type Page } from '@playwright/test';

/** The home game in `world/`. */
export const HOME = 'example';

/** The players in `world/game.json`, by their names on screen. */
export const GM = 'GM';
export const PLAYER_1 = 'Player 1';
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

/** The ids of the creatures `page`'s player can see right now. */
export function idsSeen(page: Page): Promise<string[]> {
  return page.evaluate(() => vtt.tokens().map((t) => t.id));
}

/** Where `page`'s player sees creature `id`, or undefined when they can't see it. */
export function placeSeen(page: Page, id: string): Promise<[number, number] | undefined> {
  return page.evaluate((key) => {
    const t = vtt.token(key);
    return t && ([t.x, t.y] as [number, number]);
  }, id);
}

/** Says (or rolls) `text` in chat, as typed into the chat box. */
export async function say(page: Page, text: string): Promise<void> {
  const box = page.getByRole('textbox', { name: /^Message or/ });
  await box.fill(text);
  await box.press('Enter');
}

/** The sidebar's adventure log, where chat and rolls appear. */
export const chatLog = (page: Page) => page.getByRole('complementary');

/** How `page`'s player sees creature `id`'s wounds (unhurt, hurt, bloodied, down), or undefined. */
export function healthSeen(page: Page, id: string): Promise<string | undefined> {
  return page.evaluate((key) => (vtt.token(key) as { health?: string } | undefined)?.health, id);
}
