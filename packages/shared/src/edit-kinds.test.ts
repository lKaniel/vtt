import { type Doc, DocStore } from '@vtt/core';
import { copyRefs, deleteRefs, EDIT_KINDS, pasteAt } from './edit-kinds.ts';
import { describe, expect, it } from 'vitest';

const doc = (id: string, type: string, extra: Record<string, unknown> = {}): Doc => ({ id, type, rev: 0, ...extra });

function scene(): DocStore {
  const store = new DocStore();
  store.apply([
    { op: 'create', coll: 'actors', doc: doc('goblin', 'actor', { name: 'Goblin' }) },
    {
      op: 'create',
      coll: 'main/tokens',
      doc: doc('boss', 'token', { x: 150, y: 150, actor: 'goblin', linked: false }),
    },
    {
      op: 'create',
      coll: 'main/tokens',
      doc: doc('wolf', 'token', { x: 250, y: 150, name: 'Wolf', leader: 'boss', summon: { by: 'boss', spell: 'x' } }),
    },
    { op: 'create', coll: 'main/walls', doc: doc('w1', 'wall', { a: [100, 100], b: [200, 100] }) },
    { op: 'create', coll: 'main/lights', doc: doc('torch', 'light', { x: 120, y: 120, bright: 20 }) },
    { op: 'create', coll: 'main/tiles', doc: doc('rug', 'tile', { x: 100, y: 100, w: 100, h: 100 }) },
  ]);
  return store;
}

describe('the edit kinds', () => {
  it('cover every placeable and the Actors list', () => {
    expect(Object.keys(EDIT_KINDS).sort((a, b) => a.localeCompare(b))).toEqual([
      'actor',
      'light',
      'tile',
      'token',
      'wall',
    ]);
  });

  it('move every placeable by the same offset', () => {
    const store = scene();
    const refs = [
      { coll: 'main/walls', id: 'w1' },
      { coll: 'main/lights', id: 'torch' },
      { coll: 'main/tiles', id: 'rug' },
    ];
    const { ops } = pasteAt(store, copyRefs(store, refs), { scene: 'main', offset: [100, 0] });
    const made = Object.fromEntries(ops.map((o) => (o.op === 'create' ? [o.doc.type, o.doc] : ['', {}])));
    expect(made.wall).toMatchObject({ a: [200, 100], b: [300, 100] });
    expect(made.light).toMatchObject({ x: 220, y: 120 });
    expect(made.tile).toMatchObject({ x: 200, y: 100 });
  });

  it('keep a pasted token on its actor, and its summons and followers on the copy', () => {
    const store = scene();
    const refs = ['boss', 'wolf'].map((id) => ({ coll: 'main/tokens', id }));
    const { ops } = pasteAt(store, copyRefs(store, refs), { scene: 'main', offset: [0, 100] });
    const [boss, wolf] = ops.map((o) => (o.op === 'create' ? o.doc : undefined));
    expect(boss).toMatchObject({ id: 'boss-1', actor: 'goblin', y: 250 });
    expect(wolf).toMatchObject({ id: 'wolf-1', leader: 'boss-1', summon: { by: 'boss-1' } });
  });

  it('point tokens at a pasted actor when both are copied', () => {
    const store = scene();
    const clip = copyRefs(store, [
      { coll: 'actors', id: 'goblin' },
      { coll: 'main/tokens', id: 'boss' },
    ]);
    const { ops } = pasteAt(store, clip, { scene: 'main', offset: [0, 0] });
    expect(ops.map((o) => o.op === 'create' && [o.coll, o.doc.id, o.doc.actor])).toEqual([
      ['actors', 'goblin-1', undefined],
      ['main/tokens', 'boss-1', 'goblin-1'],
    ]);
  });

  it('copy a tile group with what is in it, and paste it as a new group', () => {
    const store = scene();
    store.apply([
      { op: 'create', coll: 'main/tiles', doc: doc('camp', 'tile', { kind: 'group' }) },
      {
        op: 'create',
        coll: 'main/tiles',
        doc: doc('tent', 'tile', { x: 300, y: 300, w: 100, h: 100, parent: 'camp' }),
      },
    ]);
    const { ops } = pasteAt(store, copyRefs(store, [{ coll: 'main/tiles', id: 'camp' }]), {
      scene: 'main',
      offset: [100, 0],
    });
    expect(ops.map((o) => o.op === 'create' && o.doc)).toEqual([
      doc('camp-1', 'tile', { kind: 'group' }),
      doc('tent-1', 'tile', { x: 400, y: 300, w: 100, h: 100, parent: 'camp-1' }),
    ]);
  });

  it('delete a tile group with the last tile in it, but never a container', () => {
    const store = scene();
    store.apply([
      { op: 'create', coll: 'main/tiles', doc: doc('camp', 'tile', { kind: 'group' }) },
      { op: 'create', coll: 'main/tiles', doc: doc('tent', 'tile', { x: 0, y: 0, w: 1, h: 1, parent: 'camp' }) },
      { op: 'create', coll: 'main/tiles', doc: doc('cot', 'tile', { x: 0, y: 0, w: 1, h: 1, parent: 'rug' }) },
    ]);
    const gone = (id: string) => deleteRefs(store, [{ coll: 'main/tiles', id }]).map((o) => o.op === 'delete' && o.id);
    expect(gone('tent')).toEqual(['tent', 'camp']);
    expect(gone('cot')).toEqual(['cot']);
  });
});
