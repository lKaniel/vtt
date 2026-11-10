import type { Patch } from '@vtt/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { fogPlace } from './store/fog-store.ts';
import { GameStore } from './store/game-store.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';

// Scene levels in sight: the hero stands in the dark room, the goblin
// outside its east door, lit by a lamp. On a scene with a loft, what is up
// there (walls, lamps, creatures) is not seen from the ground, and the
// reverse. Placed lights with a darkness band shine only in it.

let store: GameStore;
let game: Game;

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  game = new Game(store);
  const levels = [
    { id: 'ground', name: 'Ground', bottom: 0 },
    { id: 'loft', name: 'Loft', bottom: 10 },
  ];
  store.applyOps([{ op: 'update', coll: 'scenes', id: 'main', patch: { levels } }]);
  // The door is on the loft only: from the ground the hero looks straight out at the goblin.
  edit('main/walls', 'door', { level: 'loft' });
});

afterEach(async () => {
  await store.flush();
});

function edit(coll: string, id: string, patch: Patch): void {
  store.applyOps([{ op: 'update', coll, id, patch }]);
}

function seen(): string[] {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer('ana')!);
  return ws
    .take('welcome')[0]!
    .tokens.map((t) => t.id)
    .sort((a, b) => a.localeCompare(b));
}

describe('scene levels', () => {
  it('leave out walls on other levels', () => {
    expect(seen()).toEqual(['goblin', 'hero']);
  });

  it('hide creatures on another level', () => {
    edit('main/tokens', 'goblin', { elevation: 10 });
    expect(seen()).toEqual(['hero']);
  });

  it('light only their own level', () => {
    edit('main/lights', 'lamp', { level: 'loft' });
    expect(seen()).toEqual(['hero']);
  });

  it('light only in their darkness band', () => {
    edit('main/lights', 'lamp', { activeAt: [0, 0.5] });
    expect(seen()).toEqual(['hero']);
  });

  it('explore fog past walls on other levels', () => {
    seen();
    expect(store.fog.map('main', 'ana', 25).explored([550, 150])).toBe(true);
  });
});

describe('fog of war on each floor', () => {
  const explored = (level: string | undefined, at: [number, number]) =>
    store.fog.map(fogPlace('main', level), 'ana', 25).explored(at);

  it('is kept apart, so looking around downstairs does not explore upstairs', () => {
    seen();
    expect(explored(undefined, [550, 150])).toBe(true);
    expect(explored('loft', [550, 150])).toBe(false);
    // Up in the loft and out of its door, by the lamp.
    edit('main/tokens', 'hero', { elevation: 10, x: 550 });
    expect(explored('loft', [550, 150])).toBe(true);
  });

  it('tells the player which floor fog is for', () => {
    const ws = new FakeSocket();
    game.connect(ws.asWebSocket, game.findPlayer('ana')!);
    edit('main/tokens', 'hero', { elevation: 10, x: 550 });
    expect(ws.take('fog').map((m) => m.level)).toContain('loft');
  });

  it('lets the GM paint fog on one floor', () => {
    const gm = new FakeSocket();
    game.connect(gm.asWebSocket, game.findPlayer('gm')!);
    const reveal = { op: 'reveal', path: [[2000, 2000]], radius: 50, players: ['ana'], level: 'loft' } as const;
    gm.receive({ t: 'fog', edit: reveal });
    expect(explored('loft', [2000, 2000])).toBe(true);
    expect(explored(undefined, [2000, 2000])).toBe(false);
  });
});
