import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// Small JSON file helpers for the server's own data (accounts, characters),
// which lives outside the world folder and isn't hot-reloaded.

/** Writes atomically: a temp file renamed over the target. */
export async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`);
  await rename(tmp, path);
}

export async function removeJson(path: string): Promise<void> {
  await rm(path, { force: true });
}

/** Every `*.json` file in `dir` (none if it doesn't exist), parsed; broken files are skipped. */
export async function readJsonDir(dir: string): Promise<unknown[]> {
  const names = await readdir(dir).catch(() => [] as string[]);
  const out: unknown[] = [];
  for (const name of names.filter((n) => n.endsWith('.json'))) {
    const data = await readJson(join(dir, name));
    if (data !== undefined) out.push(data);
  }
  return out;
}

export async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    return undefined;
  }
}
