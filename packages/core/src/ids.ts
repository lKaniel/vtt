// Ids stay readable ("goblin-3", "wall-118") so people and Claude can talk
// about them: lowercase letters, digits and dashes, unique where they live.

/** `prefix-N` with the lowest free N; with `bare`, the prefix alone when it's free. */
export function freeId(prefix: string, taken: (id: string) => boolean, { bare = false } = {}): string {
  if (bare && !taken(prefix)) return prefix;
  let n = bare ? 2 : 1;
  while (taken(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}

/** An id made from a display name: "Bandit Captain" becomes "bandit-captain". */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'item';
}
