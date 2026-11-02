import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ZipEntry } from './zip.ts';

// A game folder as a list of files, for backups and zip export/import.

/** Never part of a game: version control and tooling folders. */
const NEVER = new Set(['.git', 'node_modules', '.DS_Store']);

/** Every file under `dir`, paths relative with forward slashes, sorted; `skip` top-level names are left out. */
export async function readFolder(dir: string, skip: readonly string[] = []): Promise<ZipEntry[]> {
  const out: ZipEntry[] = [];
  const names = await readdir(dir, { recursive: true, withFileTypes: true });
  for (const d of names) {
    if (!d.isFile()) continue;
    const path = join(d.parentPath, d.name)
      .slice(dir.length + 1)
      .replaceAll('\\', '/');
    const parts = path.split('/');
    if (skip.includes(parts[0]!) || parts.some((p) => NEVER.has(p))) continue;
    out.push({ path, data: await readFile(join(dir, path)) });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** Writes `files` under `dir`. */
export async function writeFolder(dir: string, files: readonly ZipEntry[]): Promise<void> {
  for (const f of files) {
    await mkdir(dirname(join(dir, f.path)), { recursive: true });
    await writeFile(join(dir, f.path), f.data);
  }
}
