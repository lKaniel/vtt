import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gridKind, latticeOf } from '@vtt/shared';
import { tokenDistance } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { GameStore } from './store/game-store.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';

// A scene on hexes: tokens walk hex to hex, every hex 5 ft, and a fight
// counts movement and reach in hexes.

let store: GameStore;
let game: Game;
const hex = latticeOf('hex-rows', 100);

beforeEach(async () => {
  const dir = await makeWorld();
  await writeFile(join(dir, 'scenes/main/scene.json'), JSON.stringify({ darkness: 1, grid: 'hex-rows' }));
  const [x, y] = hex.centre([0, 1]);
  await writeFile(
    join(dir, 'scenes/main/tokens.json'),
    JSON.stringify([{ id: 'hero', name: 'Hero', x, y, controllers: ['ana'] }]),
  );
  store = new GameStore(dir);
  await store.load();
  game = new Game(store, { rng: () => 0 });
});

afterEach(async () => {
  await store.flush();
});

describe('a hex scene', () => {
  it('walks a token hex to hex, every hex 5 ft', () => {
    const ws = new FakeSocket();
    game.connect(ws.asWebSocket, game.findPlayer('ana')!);
    const goal = hex.centre([1, 2]);
    ws.receive({ t: 'move', token: 'hero', to: [goal[0] + 15, goal[1] - 10] });
    expect(ws.take('error').map((e) => e.message)).toEqual([]);
    const hero = store.tokens.get('hero')!;
    expect([hero.x, hero.y]).toEqual(goal);
  });

  it('counts reach in hexes', () => {
    const [x, y] = hex.centre([1, 1]);
    const near = { x, y, size: 1 };
    const hero = store.tokens.get('hero')!;
    expect(tokenDistance(hero, near, 100, gridKind(store.world))).toBe(5);
  });
});
