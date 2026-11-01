// Trees (tile groups, folders) are stored flat: each node names its `parent`
// and its `sort` key among siblings. These helpers derive the tree.

export interface TreeNode {
  id: string;
  parent?: string;
  sort?: string;
}

const bySort = (a: TreeNode, b: TreeNode): number => {
  const x = a.sort ?? '';
  const y = b.sort ?? '';
  if (x === y) return a.id < b.id ? -1 : 1;
  return x < y ? -1 : 1;
};

/** Direct children of `parent` (undefined = the top level), in sort order. */
export function childrenOf<T extends TreeNode>(nodes: readonly T[], parent: string | undefined): T[] {
  return nodes.filter((n) => n.parent === parent).sort(bySort);
}

/** Every node under `id`, depth first, each level in sort order. */
export function descendants<T extends TreeNode>(nodes: readonly T[], id: string): T[] {
  const out: T[] = [];
  const seen = new Set([id]);
  const walk = (parent: string): void => {
    for (const child of childrenOf(nodes, parent)) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      out.push(child);
      walk(child.id);
    }
  };
  walk(id);
  return out;
}

/** The parent, grandparent and so on of `id`, nearest first. Stops at a loop. */
export function ancestors<T extends TreeNode>(nodes: readonly T[], id: string): T[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: T[] = [];
  const seen = new Set([id]);
  let parent = byId.get(id)?.parent;
  while (parent !== undefined && !seen.has(parent)) {
    const node = byId.get(parent);
    if (!node) break;
    seen.add(parent);
    out.push(node);
    parent = node.parent;
  }
  return out;
}

/** Whether `id` may move under `parent` without ending up inside itself. */
export function canReparent(nodes: readonly TreeNode[], id: string, parent: string | undefined): boolean {
  if (parent === undefined) return true;
  if (parent === id) return false;
  return !ancestors(nodes, parent).some((n) => n.id === id);
}
