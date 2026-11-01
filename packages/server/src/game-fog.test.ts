import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FogMap, type ServerMessage } from '@vtt/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeTwoScenes } from './test/fixtures.ts';
import { GameStore } from './game-store.ts';

// The cellar is lit (darkness 0) with a wall along x = 0; Ana's scout stands at 150, 150.

let dir: string;
let store: GameStore;
let game: Game;

async function start(): Promise<void> {
  store = new GameStore(dir);
  await store.load();
  game = new Game(store, { rng: () => 0.5 });
}

beforeEach(async () => {
  dir = await makeTwoScenes();
  const json = JSON.parse(await readFile(join(dir, 'game.json'), 'utf8')) as { players: { scene?: string }[] };
  // Ana is already in the cellar.
  json.players[1]!.scene = 'cellar';
  await writeFile(join(dir, 'game.json'), JSON.stringify(json));
  await start();
});

afterEach(async () => {
  await store.flush();
});

function seat(playerId: string): FakeSocket {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer(playerId)!);
  return ws;
}

type FogMessage = Extract<ServerMessage, { t: 'fog' }>;

/** Everything a socket was told about one player's fog, put together. */
function fogOf(ws: FakeSocket, player: string, into = new FogMap(25)): FogMap {
  for (const m of ws.take('fog')) {
    if (m.player !== player) continue;
    if (m.full) for (const key of into.keys()) into.setBlock(key, new Uint8Array(512));
    const got = FogMap.decode({
      cell: m.cell,
      blocks: Object.fromEntries(Object.entries(m.blocks).filter(([, v]) => v)),
    });
    for (const key of Object.keys(m.blocks)) into.setBlock(key, got.block(key));
  }
  return into;
}

describe('explored fog of war', () => {
  it('is worked out by the server from what a player’s tokens see, walls and all', () => {
    const fog = fogOf(seat('ana'), 'ana');
    expect(fog.explored([150, 150])).toBe(true);
    expect(fog.explored([1500, 150])).toBe(true);
    expect(fog.explored([-100, 150])).toBe(false);
  });

  it('grows as tokens walk, sending only the blocks that changed, and is saved', async () => {
    const ana = seat('ana');
    const fog = fogOf(ana, 'ana');
    ana.receive({ t: 'move', token: 'scout', to: [150, 2950] });
    const sent = ana.sent.filter((m): m is FogMessage => m.t === 'fog');
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((m) => !m.full)).toBe(true);
    fogOf(ana, 'ana', fog);
    expect(fog.explored([150, 4500])).toBe(true);
    await store.flush();
    const saved = JSON.parse(await readFile(join(dir, 'scenes/cellar/fog/ana.json'), 'utf8')) as {
      cell: number;
      blocks: Record<string, string>;
    };
    expect(FogMap.decode(saved).explored([150, 4500])).toBe(true);
  });

  it('follows the player to another device and a restart of the server', async () => {
    seat('ana');
    await store.flush();
    await start();
    expect(fogOf(seat('ana'), 'ana').explored([1500, 150])).toBe(true);
  });

  it('goes to the GM for every player on the scene, and to each player only their own', () => {
    seat('ana');
    const bo = seat('bo');
    const gm = seat('gm');
    gm.receive({ t: 'viewScene', scene: 'cellar' });
    expect(fogOf(gm, 'ana').explored([150, 150])).toBe(true);
    expect(bo.take('fog').every((m) => m.player === 'bo')).toBe(true);
  });

  it('is not kept on a scene without exploration', () => {
    store.inScene('cellar', () => store.setWorld({ ...store.world, exploration: false }));
    const ana = seat('ana');
    expect(fogOf(ana, 'ana').empty).toBe(true);
  });
});

describe('the GM’s fog tools', () => {
  function gmInCellar(): FakeSocket {
    const gm = seat('gm');
    gm.receive({ t: 'viewScene', scene: 'cellar' });
    gm.take('fog');
    return gm;
  }

  it('reveals with a brush, and undoes and redoes it without losing what was explored', () => {
    const ana = seat('ana');
    const fog = fogOf(ana, 'ana');
    const gm = gmInCellar();
    gm.receive({ t: 'fog', edit: { op: 'reveal', at: [-500, 150], radius: 200 } });
    fogOf(ana, 'ana', fog);
    expect(fog.explored([-500, 150])).toBe(true);
    gm.receive({ t: 'undo' });
    fogOf(ana, 'ana', fog);
    expect(fog.explored([-500, 150])).toBe(false);
    expect(fog.explored([150, 150])).toBe(true);
    gm.receive({ t: 'redo' });
    expect(fogOf(ana, 'ana', fog).explored([-500, 150])).toBe(true);
    expect(gm.take('error')).toEqual([]);
  });

  it('hides explored ground again for the players picked', () => {
    const ana = seat('ana');
    const fog = fogOf(ana, 'ana');
    const gm = gmInCellar();
    gm.receive({ t: 'fog', edit: { op: 'hide', at: [1500, 150], radius: 300, players: ['ana'] } });
    expect(fogOf(ana, 'ana', fog).explored([1500, 150])).toBe(false);
  });

  it('resets a player’s fog', async () => {
    seat('ana');
    // Ana steps out, so nothing is explored again at once.
    seat('gm').receive({ t: 'sendPlayer', player: 'ana' });
    const gm = gmInCellar();
    gm.receive({ t: 'fog', edit: { op: 'reset', players: ['ana'] } });
    expect(fogOf(gm, 'ana').empty).toBe(true);
    await store.flush();
    const saved = JSON.parse(await readFile(join(dir, 'scenes/cellar/fog/ana.json'), 'utf8')) as object;
    expect(saved).toEqual({ cell: 25, blocks: {} });
    expect(gm.take('error')).toEqual([]);
  });

  it('is for the GM only', () => {
    const ana = seat('ana');
    ana.receive({ t: 'fog', edit: { op: 'reset' } });
    expect(ana.take('error').map((e) => e.message)).toEqual(['Only the GM can do that']);
  });
});
