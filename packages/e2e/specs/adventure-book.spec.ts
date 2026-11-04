// The adventure book (J), as Simple Quest's was in Foundry: quests, maps,
// lore and the party log on tabs. A player reads what the GM shared and
// writes notes of their own, which the party reads once they are shared.

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '../support/fixtures.ts';
import { PLAYER_1, PLAYER_2, atTable } from '../support/table.ts';

test.describe.configure({ timeout: 120_000 });

const shared = { default: 'observer' };
const ENTRIES = [
  {
    id: 'lost-girl',
    name: 'The Lost Girl',
    ownership: shared,
    quest: { status: 'active', objectives: [{ text: 'Ask the innkeeper', done: true }, { text: 'Search the woods' }] },
    pages: [{ id: 'p', name: 'Story', text: 'Mira went into the woods and never came back.' }],
  },
  { id: 'old-debts', name: 'Old Debts', ownership: shared, quest: { status: 'done', objectives: [] }, pages: [] },
  {
    id: 'the-wolf',
    name: 'The Grey Wolf',
    ownership: shared,
    pages: [{ id: 'p', name: 'Lore', text: 'It hunts by moonlight.' }],
  },
  { id: 'gm-secret', name: 'The Cult', pages: [{ id: 'p', name: 'Plan', text: 'Only the GM knows.' }] },
];

async function addEntries(gameDir: string): Promise<void> {
  await mkdir(join(gameDir, 'journals'), { recursive: true });
  for (const e of ENTRIES) await writeFile(join(gameDir, 'journals', `${e.id}.json`), JSON.stringify(e, null, 2));
}

test.use({ serverOptions: { prepare: addEntries } });

test('a player reads the quests and lore in the book, and shares a note with the party', async ({
  page,
  seat,
  server,
}) => {
  test.slow();
  await atTable(page, PLAYER_1);
  await page.keyboard.press('j');
  const book = page.getByRole('dialog', { name: 'Adventure book' });
  await expect(book).toBeVisible();

  // Quests by status, the open one with its objectives.
  await expect(book.getByRole('button', { name: /The Lost Girl/ })).toBeVisible();
  await expect(book.getByRole('button', { name: /Old Debts/ })).toBeVisible();
  await expect(book.getByRole('article', { name: 'The Lost Girl' })).toContainText('Search the woods');

  // Lore the GM shared, and not what they kept.
  await book.getByRole('tab', { name: 'Lore' }).click();
  await book.getByRole('button', { name: 'The Grey Wolf' }).click();
  await expect(book.getByRole('article', { name: 'The Grey Wolf' })).toContainText('It hunts by moonlight.');
  await expect(book.getByRole('button', { name: 'The Cult' })).toHaveCount(0);

  // A note of one's own, shared with the party.
  await book.getByRole('tab', { name: 'Party log' }).click();
  await book.getByRole('button', { name: 'New note' }).click();
  const name = book.getByRole('textbox', { name: 'Name' });
  await name.fill('Forest arc');
  await name.press('Enter');
  const text = book.getByRole('textbox', { name: 'Page text' });
  await text.fill('We found Mira’s ribbon by the river.');
  await text.blur();
  await book.getByRole('switch', { name: 'Shared with the party' }).click();
  await expect
    .poll(async () => {
      const files = await readdir(join(server.gameDir, 'journals'));
      const notes = await Promise.all(files.map((f) => readFile(join(server.gameDir, 'journals', f), 'utf8')));
      return notes.some((n) => n.includes('Forest arc') && n.includes('ribbon') && n.includes('observer'));
    })
    .toBe(true);

  // J again shuts the book.
  await book.getByRole('heading', { name: 'Adventure book' }).click();
  await page.keyboard.press('j');
  await expect(book).toBeHidden();

  // Another player reads it in the party's notes.
  const other = await seat(PLAYER_2);
  await other.getByRole('button', { name: 'Adventure book (J)' }).click();
  const theirs = other.getByRole('dialog', { name: 'Adventure book' });
  await theirs.getByRole('tab', { name: 'Party log' }).click();
  await theirs.getByRole('button', { name: 'Forest arc' }).click();
  await expect(theirs.getByRole('article', { name: 'Forest arc' })).toContainText('ribbon');
  await expect(theirs.getByRole('switch', { name: 'Shared with the party' })).toHaveCount(0);
});
