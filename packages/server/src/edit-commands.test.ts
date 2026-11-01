import type { Doc, Op } from '@vtt/core';
import { copyRefs, deleteRefs, EDIT_KINDS, pasteAt } from '@vtt/shared';
import type { ServerMessage } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';
import { GameStore } from './game-store.ts';

// The rule every document type follows: copy then paste, cut then undo,
// delete then undo then redo, and duplicate leave the game exactly right.
// A type added to EDIT_KINDS needs a sample here, or this test fails.

let store: GameStore;
let gm: FakeSocket;

/** One document of each kind, made by the GM before each test. */
const SAMPLES: Record<string, { coll: string; doc: Doc }> = {
  token: {
    coll: 'main/tokens',
    doc: { id: 'scout', type: 'token', rev: 0, x: 450, y: 450, actor: 'goblin', linked: false },
  },
  wall: { coll: 'main/walls', doc: { id: 'fence', type: 'wall', rev: 0, a: [400, 400], b: [500, 400] } },
  light: { coll: 'main/lights', doc: { id: 'brazier', type: 'light', rev: 0, x: 450, y: 450, bright: 10, dim: 10 } },
  tile: {
    coll: 'main/tiles',
    doc: {
      id: 'rug',
      type: 'tile',
      rev: 0,
      kind: 'rect',
      color: '#a0703c',
      texture: 'wood',
      x: 400,
      y: 400,
      w: 100,
      h: 100,
    },
  },
  actor: { coll: 'actors', doc: { id: 'sage', type: 'actor', rev: 0, name: 'Sage' } },
};

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  const game = new Game(store);
  gm = new FakeSocket();
  game.connect(gm.asWebSocket, game.findPlayer('gm')!);
  send(Object.values(SAMPLES).map(({ coll, doc }): Op => ({ op: 'create', coll, doc })));
  gm.sent = [];
});

afterEach(async () => {
  await store.flush();
});

let txns = 0;
function send(ops: Op[]): void {
  gm.receive({ t: 'ops', txn: `t${++txns}`, ops });
  const rejected = gm.sent.find((m): m is Extract<ServerMessage, { t: 'reject' }> => m.t === 'reject');
  if (rejected) throw new Error(rejected.reason);
}

/** Every document in the game, without revisions. */
function state(): Record<string, Doc[]> {
  const out: Record<string, Doc[]> = {};
  for (const coll of store.docs.collections()) {
    out[coll] = store.docs.all(coll).map((d) => ({ ...d, rev: 0 }));
  }
  return out;
}

const stripped = (doc: Doc | undefined, omit: string[]) =>
  doc && Object.fromEntries(Object.entries(doc).filter(([k]) => !['id', 'rev', ...omit].includes(k)));

describe('edit commands on every kind of document', () => {
  it('have a sample for every kind', () => {
    expect(Object.keys(SAMPLES).sort((a, b) => a.localeCompare(b))).toEqual(
      Object.keys(EDIT_KINDS).sort((a, b) => a.localeCompare(b)),
    );
  });

  describe.each(Object.entries(SAMPLES))('%s', (_kind, { coll, doc }) => {
    const ref = { coll, id: doc.id };
    const moving = EDIT_KINDS[doc.type]!.shift ? ['x', 'y', 'a', 'b'] : [];

    it('copy then paste makes a second one and leaves the first alone', () => {
      const before = store.docs.get(coll, doc.id);
      const { ops, ids } = pasteAt(store.docs, copyRefs(store.docs, [ref]), { scene: 'main', offset: [100, 0] });
      send(ops);
      expect(store.docs.get(coll, doc.id)).toEqual(before);
      expect(stripped(store.docs.get(coll, ids[0]!), moving)).toEqual(stripped(before, moving));
      expect(ids[0]).not.toBe(doc.id);
    });

    it('cut then undo puts it back exactly', () => {
      const before = state();
      const clip = copyRefs(store.docs, [ref]);
      send(deleteRefs(store.docs, [ref]));
      expect(store.docs.get(coll, doc.id)).toBeUndefined();
      expect(clip.docs).toHaveLength(1);
      gm.receive({ t: 'undo' });
      expect(state()).toEqual(before);
    });

    it('delete then undo then redo', () => {
      const before = state();
      send(deleteRefs(store.docs, [ref]));
      const after = state();
      gm.receive({ t: 'undo' });
      expect(state()).toEqual(before);
      gm.receive({ t: 'redo' });
      expect(state()).toEqual(after);
      expect(gm.take('error')).toEqual([]);
    });

    it('duplicate is paste of a copy one square over, and one undo step', () => {
      const before = state();
      const { ops } = pasteAt(store.docs, copyRefs(store.docs, [ref]), { scene: 'main', offset: [100, 100] });
      send(ops);
      expect(store.docs.all(coll)).toHaveLength(before[coll]!.length + 1);
      gm.receive({ t: 'undo' });
      expect(state()).toEqual(before);
    });
  });
});
