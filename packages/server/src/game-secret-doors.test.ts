import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Wall } from '@vtt/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { GameStore } from './game-store.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';

// The fixture room's east door, made secret: players see a plain wall.

let store: GameStore;
let game: Game;

beforeEach(async () => {
  const dir = await makeWorld();
  const file = join(dir, 'scenes/main/walls.json');
  const walls = JSON.parse(await readFile(file, 'utf8')) as Wall[];
  await writeFile(file, JSON.stringify(walls.map((w) => (w.id === 'door' ? { ...w, secret: true } : w))));
  store = new GameStore(dir);
  await store.load();
  game = new Game(store);
});

afterEach(async () => {
  await store.flush();
});

function join_(playerId: string): FakeSocket {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer(playerId)!);
  ws.receive({ t: 'view', chunks: ['0_0'] });
  return ws;
}

const doorIn = (ws: FakeSocket) =>
  ws
    .take('chunk')
    .at(-1)!
    .chunk.walls.find((w) => w.id === 'door')!;

describe('secret doors', () => {
  it('reach players as a plain wall, and the GM as a secret door', () => {
    expect(doorIn(join_('ana'))).toEqual({ id: 'door', a: [300, 100], b: [300, 200] });
    expect(doorIn(join_('gm'))).toMatchObject({ door: 'closed', secret: true });
  });

  it('are opened only by the GM, and then show as an open door', () => {
    const ana = join_('ana');
    ana.take('chunk');
    ana.receive({ t: 'door', chunk: '0_0', wall: 'door', state: 'open' });
    expect(ana.take('error')[0]!.message).toMatch(/No such door/);
    join_('gm').receive({ t: 'door', chunk: '0_0', wall: 'door', state: 'open' });
    expect(doorIn(ana)).toEqual({ id: 'door', a: [300, 100], b: [300, 200], door: 'open' });
  });
});
