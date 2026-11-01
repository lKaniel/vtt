import { describe, expect, it } from 'vitest';
import { ancestors, canReparent, childrenOf, descendants, type TreeNode } from './tree.ts';

const nodes: TreeNode[] = [
  { id: 'house', sort: 'b' },
  { id: 'floor', parent: 'house', sort: 'a' },
  { id: 'table', parent: 'floor', sort: 'V' },
  { id: 'chair', parent: 'floor', sort: 'G' },
  { id: 'tree', sort: 'a' },
];

describe('tree', () => {
  it('lists children in sort order, top level for no parent', () => {
    expect(childrenOf(nodes, 'floor').map((n) => n.id)).toEqual(['chair', 'table']);
    expect(childrenOf(nodes, undefined).map((n) => n.id)).toEqual(['tree', 'house']);
  });

  it('finds every descendant and every ancestor', () => {
    expect(descendants(nodes, 'house').map((n) => n.id)).toEqual(['floor', 'chair', 'table']);
    expect(ancestors(nodes, 'table').map((n) => n.id)).toEqual(['floor', 'house']);
  });

  it('stops at a broken parent link instead of looping', () => {
    const loop: TreeNode[] = [
      { id: 'a', parent: 'b' },
      { id: 'b', parent: 'a' },
    ];
    expect(ancestors(loop, 'a').map((n) => n.id)).toEqual(['b']);
  });

  it('refuses to put a node inside itself or its own descendant', () => {
    expect(canReparent(nodes, 'house', 'table')).toBe(false);
    expect(canReparent(nodes, 'house', 'house')).toBe(false);
    expect(canReparent(nodes, 'table', 'house')).toBe(true);
    expect(canReparent(nodes, 'table', undefined)).toBe(true);
  });
});
