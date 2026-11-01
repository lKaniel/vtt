import { describe, expect, it } from 'vitest';
import { ChangeLog, revertOps } from './history.ts';
import { DocStore, RevisionError, type Doc, type Op } from './ops.ts';

const wall = (id: string, extra: Record<string, unknown> = {}): Doc => ({ id, type: 'wall', rev: 0, ...extra });

/** Applies `ops` to `store`, noting what they change in `log`. */
function applyLogged(store: DocStore, log: ChangeLog, ops: Op[]): void {
  for (const op of ops) log.note(op.coll, op.op === 'create' ? op.doc.id : op.id, store);
  store.apply(ops);
}

function storeWith(...docs: Doc[]): DocStore {
  const store = new DocStore();
  store.apply(docs.map((doc) => ({ op: 'create', coll: 'walls', doc })));
  return store;
}

describe('ChangeLog', () => {
  it('keeps the first state of each document over several transactions', () => {
    const store = storeWith(wall('w1', { door: 'closed' }));
    const log = new ChangeLog();
    applyLogged(store, log, [{ op: 'update', coll: 'walls', id: 'w1', patch: { door: 'open' } }]);
    applyLogged(store, log, [{ op: 'update', coll: 'walls', id: 'w1', patch: { door: 'locked' } }]);
    expect(log.changes(store)).toEqual([
      { coll: 'walls', id: 'w1', before: { id: 'w1', type: 'wall', rev: 1, door: 'closed' }, after: 3 },
    ]);
  });

  it('leaves out documents made and removed again, or put back as they were', () => {
    const store = storeWith(wall('w1', { door: 'closed' }));
    const log = new ChangeLog();
    applyLogged(store, log, [
      { op: 'create', coll: 'walls', doc: wall('w2') },
      { op: 'update', coll: 'walls', id: 'w1', patch: { door: 'open' } },
    ]);
    applyLogged(store, log, [
      { op: 'delete', coll: 'walls', id: 'w2' },
      { op: 'update', coll: 'walls', id: 'w1', patch: { door: 'closed' } },
    ]);
    expect(log.changes(store)).toEqual([]);
    expect(log.empty).toBe(false);
  });
});

describe('revertOps', () => {
  it('puts back documents that were changed, made or deleted, in one transaction', () => {
    const store = storeWith(wall('w1', { door: 'closed' }), wall('w2'));
    const log = new ChangeLog();
    applyLogged(store, log, [
      { op: 'update', coll: 'walls', id: 'w1', patch: { door: 'open', sight: false } },
      { op: 'delete', coll: 'walls', id: 'w2' },
      { op: 'create', coll: 'walls', doc: wall('w3') },
    ]);
    store.apply(revertOps(store, log.changes(store)));
    const plain = (d: Doc | undefined) => d && { ...d, rev: 0 };
    expect(plain(store.get('walls', 'w1'))).toEqual(wall('w1', { door: 'closed' }));
    expect(plain(store.get('walls', 'w2'))).toEqual(wall('w2'));
    expect(store.get('walls', 'w3')).toBeUndefined();
  });

  it('only touches the fields that changed', () => {
    const store = storeWith(wall('w1', { door: 'closed', a: [0, 0] }));
    const log = new ChangeLog();
    applyLogged(store, log, [{ op: 'update', coll: 'walls', id: 'w1', patch: { door: 'open', sight: false } }]);
    expect(revertOps(store, log.changes(store))).toEqual([
      { op: 'update', coll: 'walls', id: 'w1', rev: 2, patch: { door: 'closed', sight: null } },
    ]);
  });

  it('refuses when a document has moved on since, naming it', () => {
    const store = storeWith(wall('w1', { door: 'closed' }));
    const log = new ChangeLog();
    applyLogged(store, log, [{ op: 'update', coll: 'walls', id: 'w1', patch: { door: 'open' } }]);
    const changes = log.changes(store);
    store.apply([{ op: 'update', coll: 'walls', id: 'w1', patch: { door: 'locked' } }]);
    expect(() => revertOps(store, changes)).toThrow(RevisionError);
    try {
      revertOps(store, changes);
    } catch (e) {
      expect(e).toMatchObject({ coll: 'walls', id: 'w1' });
    }
  });

  it('refuses to bring back a document someone has made again since', () => {
    const store = storeWith(wall('w1'));
    const log = new ChangeLog();
    applyLogged(store, log, [{ op: 'delete', coll: 'walls', id: 'w1' }]);
    const changes = log.changes(store);
    store.apply([{ op: 'create', coll: 'walls', doc: wall('w1') }]);
    expect(() => revertOps(store, changes)).toThrow(RevisionError);
  });

  it('undoes and redoes by reverting the revert', () => {
    const store = storeWith(wall('w1', { door: 'closed' }));
    const log = new ChangeLog();
    applyLogged(store, log, [{ op: 'update', coll: 'walls', id: 'w1', patch: { door: 'open' } }]);
    const undo = new ChangeLog();
    applyLogged(store, undo, revertOps(store, log.changes(store)));
    expect(store.get('walls', 'w1')!.door).toBe('closed');
    store.apply(revertOps(store, undo.changes(store)));
    expect(store.get('walls', 'w1')!.door).toBe('open');
  });
});

describe('DocStore revision errors', () => {
  it('say which document moved on', () => {
    const store = storeWith(wall('w1'));
    expect(() => store.apply([{ op: 'delete', coll: 'walls', id: 'w1', rev: 7 }])).toThrow(
      expect.objectContaining({ coll: 'walls', id: 'w1' }),
    );
  });

  it('take a validator for one transaction', () => {
    const store = storeWith(wall('w1'));
    const validate = (_coll: string, doc: Doc): Doc => {
      if (doc.door === 'banana') throw new Error('bad door');
      return doc;
    };
    expect(() =>
      store.apply([{ op: 'update', coll: 'walls', id: 'w1', patch: { door: 'banana' } }], { validate }),
    ).toThrow('bad door');
    store.apply([{ op: 'update', coll: 'walls', id: 'w1', patch: { door: 'banana' } }]);
    expect(store.get('walls', 'w1')!.door).toBe('banana');
  });
});
