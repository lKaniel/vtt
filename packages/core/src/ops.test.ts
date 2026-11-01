import { describe, expect, it } from 'vitest';
import { DocStore, OpError, OpSchema, type Doc, type Op } from './ops.ts';

const wall = (id: string, extra: Record<string, unknown> = {}): Doc => ({ id, type: 'wall', rev: 0, ...extra });

function storeWith(...docs: Doc[]): DocStore {
  const store = new DocStore();
  store.apply(docs.map((doc) => ({ op: 'create', coll: 'walls', doc })));
  return store;
}

describe('DocStore.apply', () => {
  it('creates documents at revision 1', () => {
    const store = storeWith(wall('w1', { a: [0, 0] }));
    expect(store.get('walls', 'w1')).toEqual({ id: 'w1', type: 'wall', rev: 1, a: [0, 0] });
    expect(store.all('walls')).toHaveLength(1);
  });

  it('refuses a second document with the same id', () => {
    const store = storeWith(wall('w1'));
    expect(() => store.apply([{ op: 'create', coll: 'walls', doc: wall('w1') }])).toThrow(OpError);
  });

  it('patches fields, bumps the revision and removes fields set to null', () => {
    const store = storeWith(wall('w1', { door: 'closed', sight: false }));
    store.apply([{ op: 'update', coll: 'walls', id: 'w1', patch: { door: 'open', sight: null } }]);
    expect(store.get('walls', 'w1')).toEqual({ id: 'w1', type: 'wall', rev: 2, door: 'open' });
  });

  it('refuses to patch id, type or rev', () => {
    const store = storeWith(wall('w1'));
    for (const key of ['id', 'type', 'rev']) {
      expect(() => store.apply([{ op: 'update', coll: 'walls', id: 'w1', patch: { [key]: 'x' } }])).toThrow(OpError);
    }
  });

  it('refuses an update made against an old revision', () => {
    const store = storeWith(wall('w1'));
    store.apply([{ op: 'update', coll: 'walls', id: 'w1', patch: { door: 'open' } }]);
    expect(() => store.apply([{ op: 'update', coll: 'walls', id: 'w1', rev: 1, patch: { door: 'closed' } }])).toThrow(
      /changed/,
    );
  });

  it('refuses to change or delete what is not there', () => {
    const store = new DocStore();
    expect(() => store.apply([{ op: 'update', coll: 'walls', id: 'nope', patch: {} }])).toThrow(OpError);
    expect(() => store.apply([{ op: 'delete', coll: 'walls', id: 'nope' }])).toThrow(OpError);
  });

  it('mirrors documents as another store has them', () => {
    const store = storeWith(wall('w1'), wall('w2'));
    store.mirror([
      { coll: 'walls', id: 'w1', doc: { ...wall('w1'), rev: 7 } },
      { coll: 'walls', id: 'w2' },
    ]);
    expect(store.all('walls')).toEqual([{ ...wall('w1'), rev: 7 }]);
  });

  it('lists the collections that hold documents', () => {
    const store = storeWith(wall('w1'));
    store.apply([{ op: 'create', coll: 'lights', doc: wall('l1') }]);
    store.apply([{ op: 'delete', coll: 'lights', id: 'l1' }]);
    expect(store.collections()).toEqual(['walls']);
  });

  it('deletes documents', () => {
    const store = storeWith(wall('w1'), wall('w2'));
    store.apply([{ op: 'delete', coll: 'walls', id: 'w1' }]);
    expect(store.get('walls', 'w1')).toBeUndefined();
    expect(store.all('walls').map((d) => d.id)).toEqual(['w2']);
  });

  it('applies a transaction all or nothing', () => {
    const store = storeWith(wall('w1'));
    expect(() =>
      store.apply([
        { op: 'update', coll: 'walls', id: 'w1', patch: { door: 'open' } },
        { op: 'delete', coll: 'walls', id: 'missing' },
      ]),
    ).toThrow(OpError);
    expect(store.get('walls', 'w1')).toEqual({ id: 'w1', type: 'wall', rev: 1 });
  });

  it('sees earlier ops of the same transaction', () => {
    const store = new DocStore();
    store.apply([
      { op: 'create', coll: 'walls', doc: wall('w1') },
      { op: 'update', coll: 'walls', id: 'w1', patch: { door: 'open' } },
    ]);
    expect(store.get('walls', 'w1')).toEqual({ id: 'w1', type: 'wall', rev: 2, door: 'open' });
  });

  it('runs the validator on every document it writes', () => {
    const store = new DocStore({
      validate: (_coll, doc) => {
        if (doc.door === 'banana') throw new Error('door must be open or closed');
        return doc;
      },
    });
    expect(() => store.apply([{ op: 'create', coll: 'walls', doc: wall('w1', { door: 'banana' }) }])).toThrow(
      /door must be/,
    );
    expect(store.get('walls', 'w1')).toBeUndefined();
  });
});

describe('inverse ops', () => {
  const roundTrip = (store: DocStore, ops: Op[]) => {
    const before = JSON.stringify(store.all('walls'));
    const inverse = store.apply(ops);
    store.apply(inverse);
    return { before, after: store.all('walls') };
  };

  it('undo a create, an update and a delete in one transaction', () => {
    const store = storeWith(wall('w1', { door: 'closed' }), wall('w2'));
    const inverse = store.apply([
      { op: 'create', coll: 'walls', doc: wall('w3') },
      { op: 'update', coll: 'walls', id: 'w1', patch: { door: 'open', sight: false } },
      { op: 'delete', coll: 'walls', id: 'w2' },
    ]);
    store.apply(inverse);
    expect(store.get('walls', 'w3')).toBeUndefined();
    expect(store.get('walls', 'w1')).toMatchObject({ door: 'closed' });
    expect(store.get('walls', 'w1')).not.toHaveProperty('sight');
    expect(store.get('walls', 'w2')).toMatchObject({ id: 'w2' });
  });

  it('leaves the documents as they were, apart from revisions', () => {
    const store = storeWith(wall('w1', { a: [0, 0] }));
    const { before, after } = roundTrip(store, [{ op: 'update', coll: 'walls', id: 'w1', patch: { a: [5, 5] } }]);
    const strip = (docs: unknown) => JSON.stringify(docs).replace(/"rev":\d+/g, '');
    expect(strip(after)).toBe(strip(JSON.parse(before)));
  });

  it('refuses an undo once someone else changed the document', () => {
    const store = storeWith(wall('w1'));
    const inverse = store.apply([{ op: 'update', coll: 'walls', id: 'w1', patch: { door: 'open' } }]);
    store.apply([{ op: 'update', coll: 'walls', id: 'w1', patch: { door: 'locked' } }]);
    expect(() => store.apply(inverse)).toThrow(/changed/);
  });
});

describe('OpSchema', () => {
  it('accepts the three ops and rejects anything else', () => {
    expect(OpSchema.safeParse({ op: 'create', coll: 'walls', doc: wall('w1') }).success).toBe(true);
    expect(OpSchema.safeParse({ op: 'update', coll: 'walls', id: 'w1', patch: { x: 1 } }).success).toBe(true);
    expect(OpSchema.safeParse({ op: 'delete', coll: 'walls', id: 'w1' }).success).toBe(true);
    expect(OpSchema.safeParse({ op: 'explode', coll: 'walls', id: 'w1' }).success).toBe(false);
    expect(OpSchema.safeParse({ op: 'create', coll: 'walls', doc: { id: 'Bad Id', type: 'wall' } }).success).toBe(
      false,
    );
  });
});
