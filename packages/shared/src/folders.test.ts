import { type Doc, DocStore, type Op } from '@vtt/core';
import { describe, expect, it } from 'vitest';
import {
  folderDeleteOps,
  folderOf,
  FolderSchema,
  folderSeen,
  foldersAbove,
  moveToFolderOps,
  newFolderOps,
} from './folders.ts';

const folder = (id: string, extra: Record<string, unknown> = {}): Doc => ({
  id,
  type: 'folder',
  rev: 0,
  name: id,
  kind: 'actors',
  ...extra,
});
const actor = (id: string, extra: Record<string, unknown> = {}): Doc => ({
  id,
  type: 'actor',
  rev: 0,
  name: id,
  ...extra,
});

function store(ops: Op[]): DocStore {
  const docs = new DocStore();
  docs.apply(ops);
  return docs;
}

const create = (coll: string, doc: Doc): Op => ({ op: 'create', coll, doc });

describe('folders', () => {
  it('are named, of one sidebar list, and may sit in another folder with a colour', () => {
    expect(FolderSchema.parse({ id: 'road', name: 'Road', kind: 'actors', parent: 'npcs', color: '#aa3322' })).toEqual({
      id: 'road',
      name: 'Road',
      kind: 'actors',
      parent: 'npcs',
      color: '#aa3322',
    });
    expect(FolderSchema.safeParse({ id: 'x', name: 'X', kind: 'tokens' }).success).toBe(false);
    expect(FolderSchema.safeParse({ id: 'x', name: 'X', kind: 'actors', color: 'red' }).success).toBe(false);
  });

  it('reads the folder a document is in, when there is one', () => {
    const docs = store([create('folders', folder('road')), create('actors', actor('bandit', { folder: 'road' }))]);
    expect(folderOf(docs, docs.get('actors', 'bandit')!)?.id).toBe('road');
    expect(folderOf(docs, actor('lost', { folder: 'gone' }))).toBeUndefined();
  });

  it('makes a new folder with a free id, at the end of its siblings', () => {
    const docs = store([create('folders', folder('road', { sort: 'a0' }))]);
    const {
      id,
      ops: [op],
    } = newFolderOps(docs, { kind: 'actors', name: 'Road' });
    expect(id).toBe('road-2');
    expect(op).toMatchObject({ op: 'create', coll: 'folders', doc: { id: 'road-2', name: 'Road', kind: 'actors' } });
    const doc = (op as Extract<Op, { op: 'create' }>).doc;
    expect(String(doc.sort) > 'a0').toBe(true);
    const {
      ops: [inner],
    } = newFolderOps(docs, { kind: 'actors', name: 'Camp', parent: 'road' });
    expect((inner as Extract<Op, { op: 'create' }>).doc.parent).toBe('road');
  });

  it('moves documents and folders into a folder, never a folder into itself', () => {
    const docs = store([
      create('folders', folder('a')),
      create('folders', folder('b', { parent: 'a' })),
      create('actors', actor('x')),
    ]);
    expect(
      moveToFolderOps(
        docs,
        [
          { coll: 'actors', id: 'x' },
          { coll: 'folders', id: 'a' },
        ],
        'b',
      ),
    ).toEqual([{ op: 'update', coll: 'actors', id: 'x', patch: { folder: 'b' } }]);
    expect(moveToFolderOps(docs, [{ coll: 'folders', id: 'b' }], undefined)).toEqual([
      { op: 'update', coll: 'folders', id: 'b', patch: { parent: null } },
    ]);
  });

  it('lets what a deleted folder held move up to its parent', () => {
    const docs = store([
      create('folders', folder('top')),
      create('folders', folder('mid', { parent: 'top' })),
      create('folders', folder('low', { parent: 'mid' })),
      create('actors', actor('x', { folder: 'mid' })),
      create('actors', actor('y', { folder: 'low' })),
    ]);
    expect(folderDeleteOps(docs, [{ op: 'delete', coll: 'folders', id: 'mid' }])).toEqual([
      { op: 'update', coll: 'actors', id: 'x', patch: { folder: 'top' } },
      { op: 'update', coll: 'folders', id: 'low', patch: { parent: 'top' } },
    ]);
    // Deleted together: low's things go up past both.
    expect(
      folderDeleteOps(docs, [
        { op: 'delete', coll: 'folders', id: 'mid' },
        { op: 'delete', coll: 'folders', id: 'low' },
      ]),
    ).toEqual([
      { op: 'update', coll: 'actors', id: 'x', patch: { folder: 'top' } },
      { op: 'update', coll: 'actors', id: 'y', patch: { folder: 'top' } },
    ]);
  });

  it('a folder at the top lets its things out at the top', () => {
    const docs = store([create('folders', folder('top')), create('actors', actor('x', { folder: 'top' }))]);
    expect(folderDeleteOps(docs, [{ op: 'delete', coll: 'folders', id: 'top' }])).toEqual([
      { op: 'update', coll: 'actors', id: 'x', patch: { folder: null } },
    ]);
  });

  it('is seen by whoever sees something in it or in a folder below it', () => {
    const docs = store([
      create('folders', folder('top', { kind: 'journals' })),
      create('folders', folder('low', { kind: 'journals', parent: 'top' })),
      create('folders', folder('empty', { kind: 'journals' })),
      create('journals', { id: 'note', type: 'journal', rev: 0, folder: 'low', shared: true }),
    ]);
    const sees = (_coll: string, doc: Doc) => doc.shared === true;
    expect(folderSeen(docs, docs.get('folders', 'top')!, sees)).toBe(true);
    expect(folderSeen(docs, docs.get('folders', 'low')!, sees)).toBe(true);
    expect(folderSeen(docs, docs.get('folders', 'empty')!, sees)).toBe(false);
    expect(folderSeen(docs, docs.get('folders', 'top')!, () => false)).toBe(false);
  });

  it('lists the folders above a document, nearest first', () => {
    const docs = store([create('folders', folder('top')), create('folders', folder('low', { parent: 'top' }))]);
    expect(foldersAbove(docs, 'low').map((d) => d.id)).toEqual(['low', 'top']);
    expect(foldersAbove(docs, undefined)).toEqual([]);
  });
});
