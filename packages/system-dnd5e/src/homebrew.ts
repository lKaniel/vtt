import { IdSchema, OwnershipSchema, type PackCompendium } from '@vtt/core';
import { z } from 'zod';
import { ClassSchema } from './spell-schema.ts';

// A game's own rules content, made in the app: documents in its homebrew
// collection (homebrew/<id>.json), each with a `kind`. They join the game's
// content like a pack's compendia, so tokens use them like SRD ones. Only
// classes so far.

const KINDS = { class: ClassSchema } as const;
type Kind = keyof typeof KINDS;

const kindOf = (doc: unknown): string | undefined => {
  const kind = (doc as { kind?: unknown } | null)?.kind;
  return typeof kind === 'string' ? kind : undefined;
};
const isKind = (kind: string | undefined): kind is Kind => kind !== undefined && kind in KINDS;

/** The homebrew documents as compendia, one per kind, for contentWith. */
export function homebrewCompendia(docs: readonly unknown[]): PackCompendium[] {
  return (Object.keys(KINDS) as Kind[]).flatMap((kind) => {
    const mine = docs.filter((d) => kindOf(d) === kind);
    if (!mine.length) return [];
    return [
      { id: `homebrew-${kind}`, name: 'Homebrew', type: kind, path: `${kind}.json`, pack: 'homebrew', docs: mine },
    ];
  });
}

/** What is wrong with a homebrew document, one line each. */
export function homebrewIssues(doc: unknown): string[] {
  const kind = kindOf(doc);
  if (!isKind(kind)) return [`kind must be one of: ${Object.keys(KINDS).join(', ')}`];
  const parsed = KINDS[kind].safeParse(doc);
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
