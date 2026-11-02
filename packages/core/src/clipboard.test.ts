import { describe, expect, it } from 'vitest';
import {
  attachedTo,
  clipboardText,
  copyDocs,
  deleteOps,
  parseClipboard,
  pasteOffset,
  pasteOps,
  type Kinds,
} from './clipboard.ts';
import { DocStore, type Doc } from './ops.ts';

// A small world: pins on a board, pins may sit in a group (parent), and
// point at a note (a sidebar document).
const kinds: Kinds = {
  note: { coll: () => 'notes' },
  group: {
    coll: (scene) => `${scene}/pins`,
    dropsWhenEmpty: () => true,
    anchor: (d) => (d.x === undefined ? undefined : [d.x as number, d.y as number]),
    shift: (d, dx, dy) => ({ ...d, x: (d.x as number) + dx, y: (d.y as number) + dy }),
  },
  pin: {
    coll: (scene) => `${scene}/pins`,
    refs: { parent: 'group', note: 'note', 'tie.to': 'pin' },
    parent: 'parent',
    anchor: (d) => [d.x as number, d.y as number],
    shift: (d, dx, dy) => ({ ...d, x: (d.x as number) + dx, y: (d.y as number) + dy }),
  },
};

const doc = (id: string, type: string, extra: Record<string, unknown> = {}): Doc => ({ id, type, rev: 0, ...extra });

function board(): DocStore {
  const store = new DocStore();
  store.apply([
    { op: 'create', coll: 'notes', doc: doc('clue', 'note') },
    { op: 'create', coll: 'a/pins', doc: doc('house', 'group', { x: 100, y: 100 }) },
    { op: 'create', coll: 'a/pins', doc: doc('door', 'pin', { x: 100, y: 150, parent: 'house', note: 'clue' }) },
    { op: 'create', coll: 'a/pins', doc: doc('lamp', 'pin', { x: 150, y: 100, parent: 'house', tie: { to: 'door' } }) },
    { op: 'create', coll: 'a/pins', doc: doc('rock', 'pin', { x: 400, y: 400 }) },
  ]);
  return store;
}

const ids = (clip: { docs: Doc[] }) => clip.docs.map((d) => d.id).sort((a, b) => a.localeCompare(b));

describe('copyDocs', () => {
  it('takes the children of what is copied, without revisions', () => {
    const clip = copyDocs(board(), kinds, [{ coll: 'a/pins', id: 'house' }]);
    expect(ids(clip)).toEqual(['door', 'house', 'lamp']);
    expect(clip.docs.every((d) => d.rev === 0)).toBe(true);
  });

  it('skips documents that are gone and takes each one once', () => {
    const clip = copyDocs(board(), kinds, [
      { coll: 'a/pins', id: 'house' },
      { coll: 'a/pins', id: 'door' },
      { coll: 'a/pins', id: 'ghost' },
    ]);
    expect(ids(clip)).toEqual(['door', 'house', 'lamp']);
  });
});

describe('pasteOps', () => {
  it('makes fresh ids and keeps links inside the copy', () => {
    const store = board();
    const clip = copyDocs(store, kinds, [{ coll: 'a/pins', id: 'house' }]);
    const { ops, ids: made } = pasteOps(store, kinds, clip, { scene: 'a', offset: [0, 0] });
    store.apply(ops);
    expect(made).toEqual(['house-1', 'door-1', 'lamp-1']);
    expect(store.get('a/pins', 'door-1')).toMatchObject({ parent: 'house-1', note: 'clue' });
    expect(store.get('a/pins', 'lamp-1')).toMatchObject({ parent: 'house-1', tie: { to: 'door-1' } });
  });

  it('keeps links to things outside the copy', () => {
    const store = board();
    const clip = copyDocs(store, kinds, [{ coll: 'a/pins', id: 'door' }]);
    const { ops } = pasteOps(store, kinds, clip, { scene: 'a', offset: [50, 0] });
    expect(ops).toEqual([
      { op: 'create', coll: 'a/pins', doc: doc('door-1', 'pin', { x: 150, y: 150, parent: 'house', note: 'clue' }) },
    ]);
  });

  it('pastes onto another scene, keeping the ids when they are free there', () => {
    const store = board();
    const clip = copyDocs(store, kinds, [{ coll: 'a/pins', id: 'rock' }]);
    const { ops } = pasteOps(store, kinds, clip, { scene: 'b', offset: [0, 0] });
    expect(ops).toEqual([{ op: 'create', coll: 'b/pins', doc: doc('rock', 'pin', { x: 400, y: 400 }) }]);
  });

  it('gives sidebar documents new ids and leaves them where they were', () => {
    const store = board();
    const clip = copyDocs(store, kinds, [{ coll: 'notes', id: 'clue' }]);
    const { ops } = pasteOps(store, kinds, clip, { scene: 'a', offset: [10, 10] });
    expect(ops).toEqual([{ op: 'create', coll: 'notes', doc: doc('clue-1', 'note') }]);
  });

  it('numbers past ids that are taken, counting its own', () => {
    const store = board();
    const clip = copyDocs(store, kinds, [{ coll: 'a/pins', id: 'rock' }]);
    store.apply(pasteOps(store, kinds, clip, { scene: 'a', offset: [0, 0] }).ops);
    const twice = { docs: [...clip.docs, ...clip.docs] };
    expect(pasteOps(store, kinds, twice, { scene: 'a', offset: [0, 0] }).ids).toEqual(['rock-2', 'rock-3']);
  });

  it('drops a link to a parent the scene it lands on does not have', () => {
    const store = board();
    const clip = copyDocs(store, kinds, [{ coll: 'a/pins', id: 'door' }]);
    const { ops } = pasteOps(store, kinds, clip, { scene: 'b', offset: [0, 0] });
    expect(ops).toEqual([{ op: 'create', coll: 'b/pins', doc: doc('door', 'pin', { x: 100, y: 150, note: 'clue' }) }]);
  });

  it('skips documents of a type it does not know', () => {
    const store = board();
    expect(pasteOps(store, kinds, { docs: [doc('x', 'mystery')] }, { scene: 'a', offset: [0, 0] }).ops).toEqual([]);
  });
});

describe('pasteOffset', () => {
  it('moves the middle of the copy to the pointer by whole squares', () => {
    const clip = copyDocs(board(), kinds, [{ coll: 'a/pins', id: 'house' }]);
    // Middle of (100..150, 100..150) is (125, 125); the pointer at (430, 290) is 305, 165 away.
    expect(pasteOffset(kinds, clip, [430, 290], 100)).toEqual([300, 200]);
  });

  it('leaves out documents with no place of their own', () => {
    const clip = { docs: [doc('g', 'group'), doc('p', 'pin', { x: 100, y: 100 })] };
    expect(pasteOffset(kinds, clip, [300, 300], 100)).toEqual([200, 200]);
  });

  it('is nothing for a copy that does not sit anywhere', () => {
    const clip = copyDocs(board(), kinds, [{ coll: 'notes', id: 'clue' }]);
    expect(pasteOffset(kinds, clip, [430, 290], 100)).toEqual([0, 0]);
  });
});

describe('deleteOps', () => {
  it('deletes the children too', () => {
    const store = board();
    const ops = deleteOps(store, kinds, [{ coll: 'a/pins', id: 'house' }]);
    expect(ops.map((o) => (o.op === 'delete' ? o.id : '')).sort((a, b) => a.localeCompare(b))).toEqual([
      'door',
      'house',
      'lamp',
    ]);
  });
});

describe('deleteOps and empty parents', () => {
  const deleted = (ops: ReturnType<typeof deleteOps>) =>
    ops.map((o) => (o.op === 'delete' ? o.id : '')).sort((a, b) => a.localeCompare(b));

  it('deletes a group once nothing is left in it', () => {
    const store = board();
    const ops = deleteOps(store, kinds, [
      { coll: 'a/pins', id: 'door' },
      { coll: 'a/pins', id: 'lamp' },
    ]);
    expect(deleted(ops)).toEqual(['door', 'house', 'lamp']);
  });

  it('keeps a group that still holds something', () => {
    expect(deleted(deleteOps(board(), kinds, [{ coll: 'a/pins', id: 'door' }]))).toEqual(['door']);
  });
});

describe('clipboard text', () => {
  it('round-trips through the system clipboard with a type marker', () => {
    const clip = copyDocs(board(), kinds, [{ coll: 'a/pins', id: 'rock' }]);
    const text = clipboardText(clip);
    expect(JSON.parse(text)).toMatchObject({ type: 'vtt/documents', v: 1 });
    expect(parseClipboard(text)).toEqual(clip);
  });

  it('ignores anything else', () => {
    expect(parseClipboard('hello')).toBeUndefined();
    expect(parseClipboard('{"type":"other","docs":[]}')).toBeUndefined();
    expect(parseClipboard('{"type":"vtt/documents","v":1,"docs":[{"id":"Bad Id"}]}')).toBeUndefined();
  });
});

describe('documents fastened to another (walls on a tile)', () => {
  const tied: Kinds = {
    ...kinds,
    string: {
      coll: (scene) => `${scene}/strings`,
      refs: { pin: 'pin' },
      attachedTo: 'pin',
      shift: (d, dx) => ({ ...d, x: (d.x as number) + dx }),
    },
  };
  const tiedBoard = () => {
    const store = board();
    store.apply([
      { op: 'create', coll: 'a/strings', doc: doc('red', 'string', { x: 100, pin: 'door' }) },
      { op: 'create', coll: 'a/strings', doc: doc('blue', 'string', { x: 400, pin: 'rock' }) },
    ]);
    return store;
  };

  it('come along when what they are fastened to is copied or deleted, even inside a group', () => {
    const store = tiedBoard();
    expect(ids(copyDocs(store, tied, [{ coll: 'a/pins', id: 'house' }]))).toEqual(['door', 'house', 'lamp', 'red']);
    const gone = deleteOps(store, tied, [{ coll: 'a/pins', id: 'rock' }]);
    expect(gone).toContainEqual({ op: 'delete', coll: 'a/strings', id: 'blue' });
  });

  it('are fastened to the pasted copy, or to nothing when pasted without it onto a scene that lacks it', () => {
    const store = tiedBoard();
    const clip = copyDocs(store, tied, [{ coll: 'a/pins', id: 'rock' }]);
    store.apply(pasteOps(store, tied, clip, { scene: 'a', offset: [100, 0] }).ops);
    expect(store.get('a/strings', 'blue-1')).toMatchObject({ pin: 'rock-1', x: 500 });
    const alone = copyDocs(store, tied, [{ coll: 'a/strings', id: 'red' }]);
    const { ops } = pasteOps(store, tied, alone, { scene: 'b', offset: [0, 0] });
    expect(ops[0]).toMatchObject({ op: 'create', coll: 'b/strings' });
    expect((ops[0] as { doc: Doc }).doc).not.toHaveProperty('pin');
  });

  it('are found for a move', () => {
    const found = attachedTo(tiedBoard(), tied, [{ coll: 'a/pins', id: 'door' }]);
    expect(found.map((f) => [f.coll, f.doc.id])).toEqual([['a/strings', 'red']]);
  });
});
