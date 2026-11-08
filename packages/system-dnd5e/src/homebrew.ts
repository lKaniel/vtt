import { IdSchema, OwnershipSchema, type PackCompendium } from '@vtt/core';
import { z } from 'zod';
import { ClassSchema, SpellSchema } from './spell-schema.ts';
import { ItemSchema } from './item-schema.ts';
import { withClassAutomation } from './content.ts';

// A game's own rules content, made in the app: documents in its homebrew
// collection (homebrew/<id>.json), each with a `kind`. They join the game's
// content like a pack's compendia, so tokens use them like SRD ones:
// classes, items and spells. An item keeps its own fields in `item` (a
// weapon has a `kind` of its own).

const KINDS = { class: ClassSchema, item: ItemSchema, spell: SpellSchema } as const;
type Kind = keyof typeof KINDS;

/** The compendium entry a homebrew document stands for. */
const entryOf = (kind: Kind, doc: unknown): unknown => {
  if (kind !== 'item') return doc;
  const d = doc as { id?: unknown; name?: unknown; item?: unknown };
  return { ...(d.item && typeof d.item === 'object' ? d.item : {}), id: d.id, name: d.name };
};

const kindOf = (doc: unknown): string | undefined => {
  const kind = (doc as { kind?: unknown } | null)?.kind;
  return typeof kind === 'string' ? kind : undefined;
};
const isKind = (kind: string | undefined): kind is Kind => kind !== undefined && kind in KINDS;

/** The homebrew documents as compendia, one per kind, for contentWith. */
export function homebrewCompendia(docs: readonly unknown[]): PackCompendium[] {
  return (Object.keys(KINDS) as Kind[]).flatMap((kind) => {
    const mine = docs.filter((d) => kindOf(d) === kind).map((d) => entryOf(kind, d));
    if (!mine.length) return [];
    return [
      { id: `homebrew-${kind}`, name: 'Homebrew', type: kind, path: `${kind}.json`, pack: 'homebrew', docs: mine },
    ];
  });
}

interface Listed {
  packs: readonly PackCompendium[];
  key: string;
  list: PackCompendium[];
}
const listed = new WeakMap<object, Listed>();

/**
 * A game's rules compendia: its packs' and its homebrew documents'. The same
 * list comes back while neither changes, so content built from it stays
 * cached. `owner` (the running game) keys that cache; `read` turns a stored
 * document into the homebrew entry (the server strips its document fields).
 */
export function gameCompendia<D extends { id: string; rev?: number }>(
  owner: object,
  packs: readonly PackCompendium[],
  docs: readonly D[],
  read?: (doc: D) => unknown,
): PackCompendium[] {
  const key = docs.map((d) => `${d.id}@${d.rev ?? 0}`).join(',');
  const last = listed.get(owner);
  if (last?.packs === packs && last.key === key) return last.list;
  const list = docs.length ? [...packs, ...homebrewCompendia(read ? docs.map((d) => read(d)) : docs)] : [...packs];
  listed.set(owner, { packs, key, list });
  return list;
}

/** What is wrong with a homebrew document, one line each. */
export function homebrewIssues(doc: unknown): string[] {
  const kind = kindOf(doc);
  if (!isKind(kind)) return [`kind must be one of: ${Object.keys(KINDS).join(', ')}`];
  const entry = entryOf(kind, doc);
  const parsed = KINDS[kind].safeParse(kind === 'class' ? withClassAutomation(entry, '2014') : entry);
  if (parsed.success) return [];
  return parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

/** A file in homebrew/: the sidebar fields, a `kind`, and that kind's own fields, checked by it. */
export const HomebrewSchema = z
  .looseObject({
    id: IdSchema,
    name: z.string().min(1),
    kind: z.string(),
    folder: z.string().optional(),
    sort: z.string().optional(),
    /** Who sees it (missing: only the GM); players need to observe the classes their characters have. */
    ownership: OwnershipSchema.optional(),
  })
  .superRefine((doc, ctx) => {
    for (const message of homebrewIssues(doc)) ctx.addIssue({ code: 'custom', message });
  });
