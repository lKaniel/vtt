import { OwnershipSchema } from '@vtt/core';
import { z } from 'zod';
import { IdSchema as id } from './schema.ts';

// The game's sidebar documents beyond actors: journal entries (handouts and
// the GM's notes, which map notes open), roll tables and playlists. Each is
// one file: journals/<id>.json, tables/<id>.json, playlists/<id>.json.

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

export const JournalSchema = z.object({ ...sidebar, pages: z.array(JournalPageSchema).default([]) });
export type Journal = z.infer<typeof JournalSchema>;

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
