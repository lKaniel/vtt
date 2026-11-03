import type { Doc } from '@vtt/core';
import { describe, expect, it } from 'vitest';
import { directoryTree, filterCounts, type DirEntry } from './directory-tree.ts';

const folder = (id: string, extra: Record<string, unknown> = {}): Doc => ({
  id,
  type: 'folder',
  rev: 1,
  name: id,
  kind: 'actors',
  ...extra,
});
const entry = (name: string, extra: Partial<DirEntry> = {}): DirEntry => ({ key: name, name, ...extra });

const names = (tree: ReturnType<typeof directoryTree>) => ({
  top: tree.entries.map((e) => e.name),
  folders: tree.folders.map((f) => ({
    id: f.folder.id,
    count: f.count,
    entries: f.entries.map((e) => e.name),
    inner: f.folders.map((i) => i.folder.id),
  })),
});

describe('a directory list', () => {
  const folders = [
    folder('road', { sort: 'b' }),
    folder('camp', { parent: 'road' }),
    folder('allies', { sort: 'a' }),
    folder('empty', { sort: 'c' }),
  ];
  const entries = [
    entry('Wolf', { folder: 'road', tags: { type: 'monster' } }),
    entry('Bandit', { folder: 'camp', tags: { type: 'monster' } }),
    entry('Mira', { folder: 'allies', tags: { type: 'character' } }),
    entry('Bram', { tags: { type: 'character' } }),
    entry('Lost', { folder: 'gone', tags: { type: 'monster' } }),
  ];

  it('nests folders in their order, each holding its entries by name, the rest at the top', () => {
    expect(names(directoryTree(folders, entries, { keepEmpty: true }))).toEqual({
      top: ['Bram', 'Lost'],
      folders: [
        { id: 'allies', count: 1, entries: ['Mira'], inner: [] },
        { id: 'road', count: 2, entries: ['Wolf'], inner: ['camp'] },
        { id: 'empty', count: 0, entries: [], inner: [] },
      ],
    });
  });

  it('leaves empty folders out when asked, and when searching or filtering', () => {
    expect(names(directoryTree(folders, entries, {})).folders.map((f) => f.id)).toEqual(['allies', 'road']);
    const found = directoryTree(folders, entries, { query: 'band', keepEmpty: true });
    expect(names(found)).toEqual({
      top: [],
      folders: [{ id: 'road', count: 1, entries: [], inner: ['camp'] }],
    });
    const monsters = directoryTree(folders, entries, { picks: { type: 'monster' }, keepEmpty: true });
    expect(names(monsters).top).toEqual(['Lost']);
    expect(names(monsters).folders.map((f) => f.id)).toEqual(['road']);
  });

  it('finds entries by their other words too', () => {
    const tree = directoryTree([], [entry('Ana', { search: 'wizard 5' })], { query: 'wizard' });
    expect(tree.entries.map((e) => e.name)).toEqual(['Ana']);
  });

  it('counts the entries under each filter value', () => {
    expect(filterCounts(entries, 'type')).toEqual(
      new Map([
        ['monster', 3],
        ['character', 2],
      ]),
    );
  });
});
