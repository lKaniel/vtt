import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { GameStore } from './store/game-store.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';

// An optimised scene's picture pyramid: the GM's browser draws the blocks
// and sends them one by one into the game's assets/baked/<scene>/<bake>/;
// the manifest comes last, and then older bakes of the scene are let go.

let dir: string;
let store: GameStore;
let game: Game;

beforeEach(async () => {
  dir = await makeWorld();
  store = new GameStore(dir);
  await store.load();
  game = new Game(store);
});

afterEach(async () => {
  await store.flush();
});

function seat(playerId: string): FakeSocket {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer(playerId)!);
  return ws;
}

const settle = () => new Promise((r) => setTimeout(r, 30));
const data = Buffer.from('block').toString('base64');
const scene = () => store.docs.all('scenes')[0]!.id;

describe('saving a bake', () => {
  it('saves the GM’s blocks under the scene’s bake and answers each one', async () => {
    const gm = seat('gm');
    gm.receive({ t: 'bakeBlock', scene: scene(), bake: 'b1', path: '0/2/1_3.webp', data, ref: 'k1' });
    await settle();
    expect(await readFile(join(dir, `assets/baked/${scene()}/b1/0/2/1_3.webp`), 'utf8')).toBe('block');
    expect(gm.take('bakeSaved')).toEqual([{ t: 'bakeSaved', ref: 'k1' }]);
  });

  it('lets go of older bakes once a new one is whole', async () => {
    const gm = seat('gm');
    const old = join(dir, `assets/baked/${scene()}/old`);
    await mkdir(old, { recursive: true });
    gm.receive({ t: 'bakeBlock', scene: scene(), bake: 'b2', path: 'manifest.json', data, ref: 'k2' });
    await settle();
    expect(await readdir(join(dir, `assets/baked/${scene()}`))).toEqual(['b2']);
  });

  it('refuses players, unknown scenes and other files', async () => {
    const gm = seat('gm');
    const ana = seat('ana');
    ana.receive({ t: 'bakeBlock', scene: scene(), bake: 'b1', path: '0/0/0_0.webp', data, ref: 'a' });
    gm.receive({ t: 'bakeBlock', scene: 'nowhere', bake: 'b1', path: '0/0/0_0.webp', data, ref: 'b' });
    gm.receive({ t: 'bakeBlock', scene: scene(), bake: 'b1', path: '../../game.json', data, ref: 'c' });
    await settle();
    expect(ana.take('error')[0]).toMatchObject({ ref: 'a' });
    expect(gm.take('error').map((e) => e.ref)).toEqual(['b', 'c']);
  });

  it('keeps baked blocks out of the Assets list', async () => {
    const gm = seat('gm');
    gm.receive({ t: 'bakeBlock', scene: scene(), bake: 'b1', path: '0/0/0_0.webp', data, ref: 'k' });
    await settle();
    gm.receive({ t: 'media' });
    await settle();
    expect(
      gm
        .take('media')
        .at(-1)!
        .entries.some((m) => m.src.includes('baked')),
    ).toBe(false);
  });
});
