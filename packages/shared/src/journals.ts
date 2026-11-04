import { OwnershipSchema } from '@vtt/core';
import { z } from 'zod';
import { IdSchema as id, TileSchema } from './schema.ts';

// The game's sidebar documents beyond actors: journal entries (handouts and
// the GM's notes, which map notes open), roll tables, playlists, macros and
// card stacks. Each is one file: journals/<id>.json, tables/<id>.json,
// playlists/<id>.json, macros/<id>.json, cards/<id>.json.

const sidebar = {
  id,
  name: z.string().min(1),
  /** A folder name in the sidebar list. */
  folder: z.string().optional(),
  /** Fractional key ordering the list (see sort-key.ts in core). */
  sort: z.string().optional(),
  /** Who sees it (missing: only the GM): limited shows the title, observer the pages. */
  ownership: OwnershipSchema.optional(),
};

export const JournalPageSchema = z.object({
  id,
  name: z.string().min(1),
  kind: z.enum(['text', 'image']).default('text'),
  /** The page's text: paragraphs, with **bold** and *italics*. */
  text: z.string().optional(),
  /** An image page's picture: an asset path or pack:// reference. */
  src: z.string().optional(),
});
export type JournalPage = z.infer<typeof JournalPageSchema>;

export const ObjectiveSchema = z.object({ text: z.string().min(1), done: z.boolean().optional() });
export type Objective = z.infer<typeof ObjectiveSchema>;

/** A quest: an entry the quest log lists by status, with objectives to tick off. */
export const QuestSchema = z.object({
  status: z.enum(['active', 'done', 'failed']).default('active'),
  objectives: z.array(ObjectiveSchema).default([]),
});
export type Quest = z.infer<typeof QuestSchema>;

export const JournalSchema = z.object({
  ...sidebar,
  pages: z.array(JournalPageSchema).default([]),
  /** Makes the entry a quest in the quest log. */
  quest: QuestSchema.optional(),
  /** A calendar note: the game time (seconds, see clock.ts) it is dated to. */
  date: z.number().int().optional(),
  /** Where the adventure book (J) shelves it: a map, or the party log (see adventure-book.ts). */
  book: z.enum(['map', 'log']).optional(),
  /** The player who wrote it: their own note, which they may change and remove. */
  author: z.string().optional(),
});
export type Journal = z.infer<typeof JournalSchema>;

/** How many of a quest's objectives are done. */
export function questProgress(quest: Quest): { done: number; total: number } {
  return { done: quest.objectives.filter((o) => o.done).length, total: quest.objectives.length };
}

/** The quest with objective `i` ticked off, or not any more. */
export function toggleObjective(quest: Quest, i: number): Quest {
  const objectives = quest.objectives.map((o, j) => {
    if (j !== i) return o;
    return o.done ? { text: o.text } : { ...o, done: true };
  });
  return { ...quest, objectives };
}

export const TableResultSchema = z.object({
  text: z.string().min(1),
  /** How many chances it has; default 1. */
  weight: z.number().int().positive().optional(),
  /** Drawn already: a table without replacement skips it until it is reset. */
  drawn: z.boolean().optional(),
});
export type TableResult = z.infer<typeof TableResultSchema>;

export const RollTableSchema = z.object({
  ...sidebar,
  description: z.string().optional(),
  results: z.array(TableResultSchema).min(1),
  /** False: a result drawn once isn't drawn again until the table is reset. Default true. */
  replacement: z.boolean().optional(),
});
export type RollTable = z.infer<typeof RollTableSchema>;

export const TrackSchema = z.object({
  id,
  name: z.string().min(1),
  /** An audio file: an asset path or a pack:// reference. */
  src: z.string().min(1),
  /** 0 to 1; default 1. */
  volume: z.number().min(0).max(1).optional(),
  /** Plays for everyone now. */
  playing: z.boolean().optional(),
  /** Starts again when it ends (default false in a sequence, true when the playlist plays together). */
  repeat: z.boolean().optional(),
});
export type Track = z.infer<typeof TrackSchema>;

export const PlaylistSchema = z.object({
  ...sidebar,
  /** sequence: one track after another; shuffle: in a random order; together: every track at once (ambience). */
  mode: z.enum(['sequence', 'shuffle', 'together']).default('sequence'),
  /** 0 to 1, times each track's volume; default 1. */
  volume: z.number().min(0).max(1).optional(),
  tracks: z.array(TrackSchema).default([]),
});
export type Playlist = z.infer<typeof PlaylistSchema>;

/** What a macro does: chat posts each line of `command` as if typed in chat; script runs it as JavaScript in the GM's browser (docs/scripting.md). */
export const MACRO_KINDS = ['chat', 'script'] as const;

export const MacroSchema = z.object({
  ...sidebar,
  kind: z.enum(MACRO_KINDS).default('chat'),
  /** Chat lines, one per line (plain text, or a chat command such as "/r 1d20+5"), or a script's code. */
  command: z.string().max(20000).default(''),
  /** Its picture on the hotbar: an asset path or pack:// reference. */
  img: z.string().optional(),
  /** The player who made it, who may change it; the GM's own have none. */
  author: z.string().optional(),
});
export type Macro = z.infer<typeof MacroSchema>;

/** A script macro: code, so only the GM writes, sees and runs it. */
export const isScriptMacro = (doc: Readonly<Record<string, unknown>>): boolean => doc.kind === 'script';

/** The chat lines a macro posts: its command's lines, without the blank ones. */
export function macroLines(command: string): string[] {
  return command
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** A playing card, tarot card or any other: it remembers the deck it came from. */
export const CardSchema = z.object({
  id,
  name: z.string().min(1),
  /** The deck it belongs to, which a reset gathers it back to. */
  origin: id,
  /** Its face and back pictures: asset paths or pack:// references (no face: drawn from suit and value). */
  face: z.string().optional(),
  back: z.string().optional(),
  suit: z.string().optional(),
  value: z.string().optional(),
  /** Words on its face. */
  text: z.string().optional(),
});
export type Card = z.infer<typeof CardSchema>;

/** deck: drawn from, face down; hand: a player's own cards; pile: played cards, face up. */
export const STACK_KINDS = ['deck', 'hand', 'pile'] as const;

/** Cards held together (cards/<id>.json): a deck, a hand or a pile. */
export const CardStackSchema = z.object({
  ...sidebar,
  kind: z.enum(STACK_KINDS).default('deck'),
  description: z.string().optional(),
  /** The back of its cards that have none of their own. */
  back: z.string().optional(),
  /** Top first. */
  cards: z.array(CardSchema).default([]),
});
export type CardStack = z.infer<typeof CardStackSchema>;

/** A compendium's tile prefab: tiles drawn together (a cart, a market stall), placed as one. */
export const PrefabSchema = z.object({
  id,
  name: z.string().min(1),
  tiles: z.array(TileSchema).min(1),
});
export type Prefab = z.infer<typeof PrefabSchema>;

/** The sidebar documents a compendium may hold, by compendium type, with the collection they go in. */
export const ENTRY_TYPES = {
  journal: { coll: 'journals', schema: JournalSchema },
  rolltable: { coll: 'tables', schema: RollTableSchema },
  playlist: { coll: 'playlists', schema: PlaylistSchema },
  macro: { coll: 'macros', schema: MacroSchema },
  cards: { coll: 'cards', schema: CardStackSchema },
} as const;
export type EntryType = keyof typeof ENTRY_TYPES;
