import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { z } from 'zod';
import { readJson } from '../store/json-files.ts';

// Installed folders (data/packs/<id>/, data/plugins/<id>/): each holds a
// manifest naming its id, which must be the folder's name.

export interface Found<T> {
  manifest: T;
  dir: string;
}

/** Every folder under `root` with a readable `file`, by name; the rest are reported in `problems`. */
export async function readManifests<T extends { id: string }>(
  root: string,
  file: string,
  schema: z.ZodType<T>,
  problems: string[],
): Promise<Found<T>[]> {
  const names = await readdir(root).catch(() => [] as string[]);
  const found: Found<T>[] = [];
  for (const name of [...names].sort((a, b) => a.localeCompare(b))) {
    const dir = join(root, name);
    const manifest = parse(await readJson(join(dir, file)), schema, `${name}/${file}`, problems);
    if (manifest && manifest.id !== name) {
      problems.push(`${name}/${file}: its id is "${manifest.id}" but its folder is "${name}"`);
    } else if (manifest) found.push({ manifest, dir });
  }
  return found;
}

function parse<T>(raw: unknown, schema: z.ZodType<T>, where: string, problems: string[]): T | undefined {
  if (raw === undefined) return undefined;
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0]!;
  problems.push(`${where}: ${issue.path.join('.')} ${issue.message}`);
  return undefined;
}
