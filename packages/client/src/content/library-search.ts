// The Baileywiki library's search (ui/BaileywikiLibrary.tsx): prefabs and
// scenes by the words of their names and tags, and by picked tags, as
// Baileywiki's own browsers in Foundry find them.

export interface LibraryEntry {
  id: string;
  name: string;
  thumb?: string;
  tags?: readonly string[];
}

const words = (text: string) => text.toLowerCase().split(/\s+/).filter(Boolean);

/** The entries whose name or tags hold every word of `text`, and that have every tag of `tags`. */
export function searchLibrary<T extends LibraryEntry>(
  entries: readonly T[],
  text: string,
  tags: readonly string[],
): T[] {
  const wanted = words(text);
  return entries.filter((e) => {
    const own = e.tags ?? [];
    if (!tags.every((t) => own.includes(t))) return false;
    const hay = `${e.name} ${own.join(' ')}`.toLowerCase();
    return wanted.every((w) => hay.includes(w));
  });
}

/** The `n` tags the most entries have, then by name. */
export function libraryTags(entries: readonly LibraryEntry[], n: number): string[] {
  const counts = new Map<string, number>();
  for (const e of entries) for (const t of new Set(e.tags ?? [])) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([t]) => t);
}
