import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { BaileywikiError } from './baileywiki-client.ts';
import { importBaileywikiModules, type ModulesReport } from './baileywiki-modules.ts';
import { unzip } from '../library/zip.ts';

// Baileywiki's library on a server without Foundry, the way their Content
// Module works in Foundry: the module (its compendia of Mass Edit presets
// and scene browsers, and Mass Edit's list of Baileywiki's files) is the
// public download foundrymods.com hands Foundry, with its own pictures
// (the scene browsers' thumbnails); the rest of Baileywiki's media stay on
// their server, fetched with the server's sign-in when someone first looks
// at them (baileywiki-files.ts). The module goes to
// data/baileywiki-module/, the prefabs into the `baileywiki` pack.

const MODULE = 'baileywiki-content';
const CONTENT_MODULE_MANIFEST = `https://foundrymods.com/api/manifest/${MODULE}`;

export interface OnlineOptions {
  /** The module's manifest; foundrymods.com's unless a test serves its own. */
  manifest?: string;
  get?: (url: string) => Promise<Response>;
  log?: (line: string) => void;
}

const ManifestSchema = z.object({ download: z.url() });

async function fetchOk(get: (url: string) => Promise<Response>, url: string): Promise<Response> {
  const res = await get(url);
  if (!res.ok) throw new BaileywikiError(`Downloading Baileywiki's Content Module failed: ${res.status} from ${url}`);
  return res;
}

/** The module's code, which the server never keeps. */
const CODE = /^(module|scripts|styles|lang|languages|templates|node_modules)\//;
const kept = (rel: string) => !!rel && !CODE.test(rel) && !/\.(m?js|css|hbs|html)$/i.test(rel);

/** Downloads the Content Module into `modulesDir/baileywiki-content/`. */
async function downloadModule(modulesDir: string, opts: OnlineOptions): Promise<void> {
  const get = opts.get ?? ((url: string) => fetch(url));
  const manifest = ManifestSchema.parse(await (await fetchOk(get, opts.manifest ?? CONTENT_MODULE_MANIFEST)).json());
  opts.log?.(`downloading ${manifest.download}`);
  const archive = Buffer.from(await (await fetchOk(get, manifest.download)).arrayBuffer());
  const dir = join(modulesDir, MODULE);
  await rm(dir, { recursive: true, force: true });
  for (const entry of unzip(archive, { maxBytes: 2 * 1024 ** 3 })) {
    const rel = entry.path.replace(/^[^/]+\//, '');
    if (!kept(rel)) continue;
    await mkdir(dirname(join(dir, rel)), { recursive: true });
    await writeFile(join(dir, rel), entry.data);
  }
}

/** Downloads Baileywiki's Content Module and imports its prefabs and scenes into the pack in `packsDir`. */
export async function installBaileywikiLibrary(packsDir: string, opts: OnlineOptions = {}): Promise<ModulesReport> {
  const modulesDir = join(dirname(packsDir), 'baileywiki-module');
  await downloadModule(modulesDir, opts);
  return importBaileywikiModules(modulesDir, packsDir, { modules: [MODULE], online: true, link: true, log: opts.log });
}
