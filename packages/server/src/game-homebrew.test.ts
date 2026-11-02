import type { Doc, Op } from '@vtt/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { contentFor } from './library/game-packs.ts';
import { GameStore } from './store/game-store.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';

// The GM's homebrew classes: documents in homebrew/ the game's tokens use
// like the SRD's.

let store: GameStore;
let game: Game;

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  game = new Game(store, { rng: () => 0 });
});

afterEach(async () => {
  await store.flush();
});

function seat(playerId: string): FakeSocket {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer(playerId)!);
  ws.sent = [];
  return ws;
}

const illusionist = {
  id: 'illusionist',
  type: 'homebrew',
  rev: 0,
  kind: 'class',
  name: 'Illusionist',
  hitDie: 8,
  saves: ['int', 'wis'],
  features: [{ id: 'weave', name: 'Weave', level: 1 }],
};

const create = (doc: Record<string, unknown>): Op => ({ op: 'create', coll: 'homebrew', doc: doc as Doc });

describe('homebrew classes', () => {
  it('are made by the GM and join the game’s content', () => {
    const gm = seat('gm');
    gm.receive({ t: 'ops', txn: 't', ops: [create(illusionist)] });
    expect(gm.take('reject')).toEqual([]);
    const hero = { stats: { class: 'illusionist', level: 1 } };
    expect(
      contentFor(store, hero)
        .classes.get('illusionist')
        ?.features.map((f) => f.id),
    ).toEqual(['weave']);
  });

  it('are checked like the files they are saved in', () => {
    const gm = seat('gm');
    gm.receive({ t: 'ops', txn: 't', ops: [create({ ...illusionist, hitDie: 'd8' })] });
    expect(gm.take('reject').map((r) => r.reason)).toEqual([expect.stringMatching(/hitDie/)]);
  });

  it('reach the players once the GM shares them', () => {
    const gm = seat('gm');
    const ana = seat('ana');
    gm.receive({ t: 'ops', txn: 't', ops: [create(illusionist)] });
    expect(JSON.stringify(ana.sent)).not.toContain('Illusionist');
    gm.receive({
      t: 'ops',
      txn: 't',
      ops: [{ op: 'update', coll: 'homebrew', id: 'illusionist', patch: { ownership: { default: 'observer' } } }],
    });
    expect(JSON.stringify(ana.sent)).toContain('Illusionist');
    ana.receive({ t: 'ops', txn: 't', ops: [create({ ...illusionist, id: 'mine' })] });
    expect(ana.take('reject')).toHaveLength(1);
  });
});
