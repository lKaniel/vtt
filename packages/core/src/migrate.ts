// Stored documents carry a schema version `v` (missing = 1). Each migration
// upgrades a document by one version, so files written by older builds keep
// loading: step 0 turns v1 into v2, step 1 turns v2 into v3, and so on.

export type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

/** Upgrade `doc` to version `steps.length + 1`. A current document comes back unchanged. */
export function migrate(doc: Record<string, unknown>, steps: readonly Migration[]): Record<string, unknown> {
  const current = steps.length + 1;
  const from = typeof doc.v === 'number' ? doc.v : 1;
  if (from > current) throw new Error(`${String(doc.id)} was saved by a newer version (v${from} > v${current})`);
  if (from === current) return doc;
  let out = doc;
  for (const step of steps.slice(from - 1)) out = step(out);
  return { ...out, v: current };
}
