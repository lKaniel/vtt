import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';
import { WorldStore } from './world-store.ts';

let dir: string;
let store: WorldStore;
let game: Game;

beforeEach(async () => {
  dir = await makeWorld();
  store = new WorldStore(dir);
  await store.load();
  game = new Game(store);
});

afterEach(async () => {
  await store.flush();
});

function seat(playerId: string): FakeSocket {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer(playerId)!);
  ws.take('welcome');
  return ws;
}

const readJson = async (rel: string): Promise<unknown> => JSON.parse(await readFile(join(dir, rel), 'utf8'));

describe('the GM editing the map', () => {
  it('draws a wall and saves it to its chunk', async () => {
    const gm = seat('gm');
    gm.receive({ t: 'view', chunks: ['0_0'] });
    gm.take('chunk');
    gm.receive({ t: 'mapEdit', edit: { op: 'addWall', wall: { a: [1000, 0], b: [1000, 300] } } });
    const wall = store.chunks.get('0_0')!.walls.at(-1)!;
    expect(wall).toMatchObject({ a: [1000, 0], b: [1000, 300] });
    expect(gm.take('chunk')).toHaveLength(1);
    await store.flush();
    const saved = (await readJson('chunks/0_0.json')) as { walls: unknown[] };
    expect(saved.walls).toContainEqual(wall);
  });

  it('places and erases a light', () => {
    const gm = seat('gm');
    gm.receive({ t: 'mapEdit', edit: { op: 'addLight', light: { x: 50, y: 50, bright: 20, dim: 20 } } });
    const light = store.chunks.get('0_0')!.lights.at(-1)!;
    gm.receive({ t: 'mapEdit', edit: { op: 'remove', chunk: '0_0', id: light.id } });
    expect(store.chunks.get('0_0')!.lights.some((l) => l.id === light.id)).toBe(false);
  });

  it('tells the GM when an edit makes no sense', () => {
    const gm = seat('gm');
    gm.receive({ t: 'mapEdit', edit: { op: 'remove', chunk: '0_0', id: 'nothing' } });
    expect(gm.take('error')[0]!.message).toBe('Nothing to erase there');
  });

  it('is for the GM only', () => {
    const ana = seat('ana');
    ana.receive({ t: 'mapEdit', edit: { op: 'addLight', light: { x: 50, y: 50, bright: 20, dim: 20 } } });
    ana.receive({ t: 'darkness', darkness: 1 });
    expect(ana.take('error').map((e) => e.message)).toEqual(Array(2).fill('Only the GM can do that'));
  });
});

describe('the time of day', () => {
  it('changes darkness for everyone without reconnecting, and saves it', async () => {
    const gm = seat('gm');
    const ana = seat('ana');
    gm.receive({ t: 'darkness', darkness: 0.8 });
    expect(ana.take('lighting')).toEqual([{ t: 'lighting', darkness: 0.8 }]);
    expect(ana.readyState).toBe(1);
    await store.flush();
    expect(await readJson('world.json')).toMatchObject({ darkness: 0.8 });
  });
});
