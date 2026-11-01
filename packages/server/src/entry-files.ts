import { JournalSchema, PlaylistSchema, RollTableSchema } from '@vtt/shared';
import type { z } from 'zod';

// The game's sidebar documents with a file each, like actors: journal
// entries, roll tables and playlists (see journals.ts in shared).

export const ENTRY_COLLS = {
  journals: { type: 'journal', schema: JournalSchema },
  tables: { type: 'rolltable', schema: RollTableSchema },
  playlists: { type: 'playlist', schema: PlaylistSchema },
} as const;

export type EntryColl = keyof typeof ENTRY_COLLS;
export type EntryData = z.infer<(typeof ENTRY_COLLS)[EntryColl]['schema']>;

export const isEntryColl = (name: string): name is EntryColl => name in ENTRY_COLLS;

/** The errors in an entry file, or its data. */
export function parseEntryData(coll: EntryColl, id: string, json: unknown): { data?: EntryData; errors: string[] } {
  const r = ENTRY_COLLS[coll].schema.safeParse(json);
  if (!r.success)
    return { errors: r.error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)) };
  if (r.data.id !== id) return { errors: [`id "${r.data.id}" must match the file name "${id}"`] };
  return { data: r.data, errors: [] };
}
