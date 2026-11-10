import { join } from 'node:path';
import { z } from 'zod';
import { readJson, writeJson } from '../store/json-files.ts';

// What a Foundry world import made, written beside the game it made: the
// world it came from (so the game can be imported again without asking)
// and every file the import wrote. A re-import (foundry-reimport.ts) tells
// the GM's own work from Foundry's by it.

export const IMPORT_MANIFEST = 'foundry-import.json';

const ManifestSchema = z.object({
  /** The Foundry world folder. */
  world: z.string(),
  /** Foundry's Data folder, when it was given. */
  dataDir: z.string().optional(),
  /** When it was imported. */
  at: z.number(),
  /** The files the import wrote, by their path in the game folder (pictures and sounds aside). */
  files: z.array(z.string()),
});
export type ImportManifest = z.infer<typeof ManifestSchema>;

/** The manifest of the game in `dir`; none for a game not imported (or imported before manifests). */
export async function readManifest(dir: string): Promise<ImportManifest | undefined> {
  const parsed = ManifestSchema.safeParse(await readJson(join(dir, IMPORT_MANIFEST)));
  return parsed.success ? parsed.data : undefined;
}

export async function writeManifest(dir: string, manifest: ImportManifest): Promise<void> {
  await writeJson(join(dir, IMPORT_MANIFEST), {
    ...manifest,
    files: [...manifest.files].sort((a, b) => a.localeCompare(b)),
  });
}
