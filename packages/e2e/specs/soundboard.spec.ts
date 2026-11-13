// The GM's soundboard (PlaylistsTab, SoundboardEditor): the GM makes a board
// in the Music tab, uploads a short sound from their computer, and a press
// of its button plays it once for a player.

import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.ts';
import { GM, PLAYER_2, atTable } from '../support/table.ts';

test.describe.configure({ timeout: 120_000 }); // two browsers and an upload

/** A tiny silent WAV, enough to upload as a sound. */
function silentWav(): Buffer {
  const samples = 800;
  const b = Buffer.alloc(44 + samples);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + samples, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(8000, 28);
  b.writeUInt16LE(1, 32);
  b.writeUInt16LE(8, 34);
  b.write('data', 36);
  b.writeUInt32LE(samples, 40);
  b.fill(128, 44);
  return b;
}

/** Notes the files this page starts playing, in `window.played`. */
async function listen(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { played: string[] };
    w.played = [];
    const proto = HTMLMediaElement.prototype;
    const play = Object.getOwnPropertyDescriptor(proto, 'play')!.value as (this: HTMLMediaElement) => Promise<void>;
    proto.play = function (this: HTMLMediaElement) {
      w.played.push(this.src);
      return play.call(this);
    };
  });
}

const played = (page: Page) => page.evaluate(() => (window as unknown as { played: string[] }).played);

test('the GM uploads a sound to a soundboard and a press plays it for a player', async ({ page, seat }) => {
  await atTable(page, GM);
  const player = await seat(PLAYER_2);
  await listen(player);

  await page.getByRole('tab', { name: 'Music' }).click();
  await page.getByRole('button', { name: 'Soundboard' }).click();
  await page.getByRole('listitem').filter({ hasText: 'Soundboard' }).click();
  const board = page.getByRole('dialog', { name: 'Soundboard' });
  await expect(board.getByText('No sounds yet')).toBeVisible();
  await board
    .getByLabel('Upload', { exact: true })
    .setInputFiles({ name: 'Dragon roar.wav', mimeType: 'audio/wav', buffer: silentWav() });

  const roar = board.getByRole('button', { name: 'Dragon roar', exact: true });
  await expect(roar).toBeVisible();
  await roar.click();
  await expect.poll(() => played(player)).toEqual([expect.stringMatching(/\/assets\/uploads\/dragon-roar\.wav$/)]);
});
