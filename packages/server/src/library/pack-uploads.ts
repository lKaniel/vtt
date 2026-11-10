import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { type PackManifest, PackManifestSchema } from '@vtt/core';
import { readJson, writeJson } from '../store/json-files.ts';
import { filesUnder, type PackStore } from './pack-store.ts';

// Packs put on the server from Setup (pack-api.ts), file by file: the
// browser sends the pack's pack.json, then each file of its folder, then
// says it's done. Files wait in packs/.uploads/<id>/ (on the same disk as
// the packs, so finishing is a rename) and an upload that broke off goes
// on where it stopped: begin() says which files are there already. A
// finished pack replaces the one installed before.

/** The biggest single file a pack upload takes. */
const MAX_FILE = 2 * 1024 ** 3;
const UPLOADS = '.uploads';

/** Something the upload can't do, with the reason to show. */
export class PackUploadError extends Error {}

export interface UploadStart {
  id: string;
  /** Files already uploaded, with their sizes. */
  have: Record<string, number>;
}

/** A path inside a pack: forward slashes, no empty, `.` or `..` parts. */
function isInnerPath(path: string): boolean {
  if (!path || path.includes('\\') || path.includes('\0')) return false;
  return path.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

export class PackUploads {
  constructor(
    private packs: PackStore,
    private maxFile = MAX_FILE,
  ) {}

  private staging(id: string): string {
    return join(this.packs.dir, UPLOADS, id);
  }

  /** Starts (or goes on with) uploading the pack `manifest` describes. */
  async begin(manifest: unknown): Promise<UploadStart> {
    const parsed = PackManifestSchema.safeParse(manifest);
    if (!parsed.success) throw new PackUploadError(`That pack.json is not a pack: ${parsed.error.issues[0]!.message}`);
    const { id } = parsed.data;
    const dir = this.staging(id);
    const before = await readJson(join(dir, 'pack.json'));
    if (JSON.stringify(before) !== JSON.stringify(manifest)) {
      await rm(dir, { recursive: true, force: true });
      await writeJson(join(dir, 'pack.json'), manifest);
    }
    return { id, have: await this.sizes(dir) };
  }

  private async sizes(dir: string): Promise<Record<string, number>> {
    const have: Record<string, number> = {};
    for (const path of await filesUnder(dir)) {
      if (!path.endsWith('.part')) have[path] = (await stat(join(dir, path))).size;
    }
    return have;
  }

  private async started(id: string): Promise<string> {
    const dir = this.staging(id);
    const has = /^[a-z0-9-]+$/.test(id) && (await readJson(join(dir, 'pack.json'))) !== undefined;
    if (!has) throw new PackUploadError('Start the upload with its pack.json first.');
    return dir;
  }

  /** Writes one file of the pack from `body`; it shows up only once all of it has arrived. */
  async putFile(id: string, path: string, body: AsyncIterable<Buffer> | Iterable<Buffer>): Promise<void> {
    if (!isInnerPath(path)) throw new PackUploadError(`Not a file of a pack: ${path}`);
    const file = join(await this.started(id), path);
    await mkdir(dirname(file), { recursive: true });
    const part = `${file}.part`;
    try {
      await pipeline(body, this.limit(path), createWriteStream(part));
      await rename(part, file);
    } catch (e) {
      await rm(part, { force: true });
      throw e;
    }
  }

  /** Passes the file through, failing once it is bigger than maxFile. */
  private limit(path: string) {
    const max = this.maxFile;
    return async function* (source: AsyncIterable<Buffer> | Iterable<Buffer>) {
      let size = 0;
      for await (const chunk of source) {
        size += chunk.length;
        if (size > max) throw new PackUploadError(`${path} is too big for a pack upload.`);
        yield chunk;
      }
    };
  }

  /** Installs the uploaded pack in place of the one before; its manifest. */
  async finish(id: string): Promise<PackManifest> {
    const dir = await this.started(id);
    const target = join(this.packs.dir, id);
    await rm(target, { recursive: true, force: true });
    await rename(dir, target);
    await this.packs.load();
    const installed = this.packs.get(id);
    if (!installed)
      throw new PackUploadError(this.packs.problems.find((p) => p.startsWith(`${id}/`)) ?? 'The pack did not load.');
    return installed;
  }

  /** Drops an upload that won't be finished. */
  async cancel(id: string): Promise<void> {
    await rm(await this.started(id), { recursive: true, force: true });
  }

  /** Deletes an installed pack, files and all. */
  async remove(id: string): Promise<void> {
    if (!this.packs.get(id)) throw new PackUploadError('No such pack.');
    await rm(join(this.packs.dir, id), { recursive: true, force: true });
    await this.packs.load();
  }

  /** Uploads begun and not finished. */
  async pending(): Promise<string[]> {
    return (await readdir(join(this.packs.dir, UPLOADS)).catch(() => [] as string[])).sort((a, b) =>
      a.localeCompare(b),
    );
  }
}
