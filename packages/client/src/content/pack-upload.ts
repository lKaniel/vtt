import type { PackManifest } from '@vtt/core';

// Putting a pack on the server from Setup: the admin picks the pack's
// folder, its pack.json starts the upload, and each file the server
// doesn't have yet goes up on its own (a few at a time), so a pack of many
// gigabytes needs no zip and a broken upload goes on where it stopped.

export interface PackFile {
  /** Inside the pack, forward slashes. */
  path: string;
  file: File;
}

export interface PackFolder {
  manifest: unknown;
  files: PackFile[];
}

/** The server calls the upload makes (server-api.ts). */
export interface PackUploadApi {
  beginPack(manifest: unknown): Promise<{ id: string; have: Record<string, number> }>;
  putPackFile(id: string, path: string, file: File): Promise<unknown>;
  finishPack(id: string): Promise<{ pack: Pick<PackManifest, 'id' | 'name'> }>;
}

const AT_ONCE = 4;
const pathOf = (f: File) => f.webkitRelativePath || f.name;

/** The pack in a picked folder: the shallowest pack.json and every file beside or below it. */
export async function packFolder(picked: readonly File[]): Promise<PackFolder> {
  const top = picked
    .filter((f) => pathOf(f).split('/').pop() === 'pack.json')
    .sort((a, b) => pathOf(a).length - pathOf(b).length)[0];
  if (!top) throw new Error('This folder has no pack.json: pick the folder of one pack.');
  const root = pathOf(top).slice(0, -'pack.json'.length);
  let manifest: unknown;
  try {
    manifest = JSON.parse(await top.text());
  } catch {
    throw new Error('Its pack.json is not JSON.');
  }
  const files = picked
    .filter((f) => f !== top && pathOf(f).startsWith(root))
    .map((file) => ({ path: pathOf(file).slice(root.length), file }))
    .sort((a, b) => a.path.localeCompare(b.path));
  return { manifest, files };
}

/** The files the server lacks, or has with another size. */
export function toSend(files: readonly PackFile[], have: Readonly<Record<string, number>>): PackFile[] {
  return files.filter((f) => have[f.path] !== f.file.size);
}

/** Uploads the pack: `progress` hears bytes sent of the bytes to send. */
export async function uploadPack(
  api: PackUploadApi,
  folder: PackFolder,
  progress: (done: number, total: number) => void,
): Promise<Pick<PackManifest, 'id' | 'name'>> {
  const { id, have } = await api.beginPack(folder.manifest);
  const queue = toSend(folder.files, have);
  const total = queue.reduce((n, f) => n + f.file.size, 0);
  let done = 0;
  progress(done, total);
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      await api.putPackFile(id, next.path, next.file);
      done += next.file.size;
      progress(done, total);
    }
  };
  await Promise.all(Array.from({ length: AT_ONCE }, worker));
  return (await api.finishPack(id)).pack;
}
