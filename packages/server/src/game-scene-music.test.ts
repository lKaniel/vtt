import type { Doc } from '@vtt/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { GameStore } from './game-store.ts';
import { FakeSocket, makeTwoScenes } from './test/fixtures.ts';

// A scene can name a playlist that starts when the game moves there; the
// one playing before stops.

let store: GameStore;
let game: Game;

beforeEach(async () => {
  store = new GameStore(await makeTwoScenes());
  await store.load();
  game = new Game(store);
});

afterEach(async () => {
  await store.flush();
});

const list = (id: string, playing = false): Doc => ({
  id,
  type: 'playlist',
  rev: 0,
  name: id,
  mode: 'sequence',
  tracks: [{ id: 't', name: 'T', src: `${id}.ogg`, ...(playing ? { playing } : {}) }],
});

describe('scene music', () => {
  it("starts the scene's playlist when the game moves there, and stops the one before", () => {
    store.applyOps([
      { op: 'create', coll: 'playlists', doc: list('town', true) },
      { op: 'create', coll: 'playlists', doc: list('dungeon') },
      { op: 'update', coll: 'scenes', id: 'cellar', patch: { playlist: 'dungeon' } },
    ]);
    const gm = new FakeSocket();
    game.connect(gm.asWebSocket, game.findPlayer('gm')!);
    gm.receive({ t: 'activateScene', scene: 'cellar' });
    const playing = (id: string) => (store.docs.get('playlists', id)!.tracks as { playing?: boolean }[])[0]!.playing;
    expect(playing('dungeon')).toBe(true);
    expect(playing('town')).toBeUndefined();
  });

  it('leaves the music alone on a scene without a playlist', () => {
    store.applyOps([{ op: 'create', coll: 'playlists', doc: list('town', true) }]);
    const gm = new FakeSocket();
    game.connect(gm.asWebSocket, game.findPlayer('gm')!);
    gm.receive({ t: 'activateScene', scene: 'cellar' });
    expect((store.docs.get('playlists', 'town')!.tracks as { playing?: boolean }[])[0]!.playing).toBe(true);
  });
});
