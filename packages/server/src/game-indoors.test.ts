import type { Patch } from '@vtt/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { GameStore } from './store/game-store.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';

// Rooms the sky can't light: the test room (300 px square, a door east) by
// day, with the goblin in the room's far corner. Under the open sky the hero
// sees it; under a roof, with the door shut, the room is dark.

let store: GameStore;
let game: Game;

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  game = new Game(store);
  store.applyOps([{ op: 'update', coll: 'scenes', id: 'main', patch: { darkness: 0, darknessFollowsClock: false } }]);
  store.applyOps([{ op: 'delete', coll: 'main/lights', id: 'lamp' }]);
  edit('main/tokens', 'goblin', { x: 250, y: 250 });
});

afterEach(async () => {
  await store.flush();
});

function edit(coll: string, id: string, patch: Patch): void {
  store.applyOps([{ op: 'update', coll, id, patch }]);
}

function roof(): void {
  const doc = {
    type: 'tile',
    id: 'roof',
    rev: 0,
    kind: 'image',
    src: '/roof.webp',
    x: 0,
    y: 0,
    w: 300,
    h: 300,
    overhead: true,
  };
  store.applyOps([{ op: 'create', coll: 'main/tiles', doc }]);
}

function seen(): string[] {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer('ana')!);
  return ws
    .take('welcome')[0]!
    .tokens.map((t) => t.id)
    .sort((a, b) => a.localeCompare(b));
}

describe('indoors', () => {
  it('lets daylight into a room with no roof', () => {
    expect(seen()).toEqual(['goblin', 'hero']);
  });

  it('keeps daylight out of a roofed room with its door shut', () => {
    roof();
    expect(seen()).toEqual(['hero']);
  });

  it('lets daylight in through the open door', () => {
    roof();
    edit('main/walls', 'door', { door: 'open' });
    expect(seen()).toEqual(['goblin', 'hero']);
  });
});
