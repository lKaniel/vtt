import { expect, test } from '../support/fixtures.ts';
import { GM, HOME, PLAYER_2, atTable, joinGame } from '../support/table.ts';

test('the main page lists the games on the server', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Example: the crossroads/ })).toBeVisible();
  await page.getByRole('button', { name: /Example: the crossroads/ }).click();
  await expect(page).toHaveURL(new RegExp(`#/join/${HOME}$`));
  await expect(page.getByRole('button', { name: 'Join', exact: true })).toBeDisabled();
});

test('the GM joins and sits at the table as GM', async ({ page }) => {
  await atTable(page, GM);
  expect(await page.evaluate(() => vtt.isGm())).toBe(true);
  await expect(page.getByRole('button', { name: 'Start combat' })).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Editor mode' })).toBeVisible();
});

test('a player joins without GM tools', async ({ page }) => {
  await atTable(page, PLAYER_2);
  expect(await page.evaluate(() => vtt.user()?.name)).toBe(PLAYER_2);
  expect(await page.evaluate(() => vtt.isGm())).toBe(false);
  await expect(page.getByRole('button', { name: 'Start combat' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Walls' })).toHaveCount(0);
});

test('the browser remembers its player until Switch player', async ({ page }) => {
  await joinGame(page, PLAYER_2);
  await page.goto('/');
  await page.getByRole('button', { name: /Example: the crossroads/ }).click();
  await expect(page).toHaveURL(new RegExp(`#/games/${HOME}$`));
  await page.getByRole('button', { name: 'Switch player' }).click();
  await expect(page).toHaveURL(new RegExp(`#/join/${HOME}$`));
});

test('a password keeps others from playing as a player', async ({ page, browser, server, seat }) => {
  await joinGame(page, GM);
  await page.getByRole('button', { name: `Put a password on ${PLAYER_2}` }).click();
  await page
    .getByLabel(/password/i)
    .last()
    .fill('wolfsbane');
  await page
    .getByRole('button', { name: /Save|Set/ })
    .last()
    .click();

  const other = await (await browser.newContext({ baseURL: server.url })).newPage();
  await other.goto(`/#/join/${HOME}`);
  await other.getByRole('combobox', { name: 'Your player' }).click();
  await other.getByRole('option', { name: /^Player 2 / }).click();
  await other.getByRole('textbox', { name: 'Password' }).fill('wrong');
  await other.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(other.getByText('Wrong password.')).toBeVisible();
  await expect(other).toHaveURL(new RegExp(`#/join/${HOME}$`));
  await other.context().close();

  const player = await seat(PLAYER_2, { password: 'wolfsbane' });
  expect(await player.evaluate(() => vtt.user()?.name)).toBe(PLAYER_2);
});
