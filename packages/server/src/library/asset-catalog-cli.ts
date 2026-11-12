import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { readJson } from '../store/json-files.ts';
import { typedPath, usage } from '../paths.ts';
import { buildCatalog } from './asset-catalog.ts';

// pnpm build-asset-catalog <pack folder> [--px-per-square 150] [--feet-per-unit 5] [--include <regex>]
//   [--media <folder>] [--prefix media/] [--top <folders, or start*>] [--usage <file>] [--out <file>]
// Writes the pack's catalog.json: every tile, texture and model in its media
// with its size in feet, for Claude's map tools (find_assets, build_scene
// props and scatter). Defaults suit Baileywiki: 150 px a square, 5 ft a
// model unit. A media-index.json beside pack.json adds its tags and previews.

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    'px-per-square': { type: 'string' },
    'feet-per-unit': { type: 'string' },
    include: { type: 'string' },
    top: { type: 'string' },
    media: { type: 'string' },
    prefix: { type: 'string' },
    out: { type: 'string' },
    source: { type: 'string' },
    usage: { type: 'string' },
  },
});
/** `--top a,b` keeps those folders; `--top baileywiki-*` every folder starting so. */
function topFolders(list: string): (folder: string) => boolean {
  const names = list.split(',').map((n) => n.trim());
  return (folder) => names.some((n) => (n.endsWith('*') ? folder.startsWith(n.slice(0, -1)) : folder === n));
}

const [packArg] = positionals;
if (!packArg)
  usage('pnpm build-asset-catalog <pack folder> [--px-per-square 150] [--feet-per-unit 5] [--include <regex>]');
const pack = typedPath(packArg);
const index = (await readJson(join(pack, 'media-index.json'))) as Record<string, { tags?: string[] }> | undefined;
const pxUsage = values.usage ? ((await readJson(typedPath(values.usage))) as Record<string, number>) : undefined;
const started = Date.now();
const catalog = await buildCatalog(values.media ? typedPath(values.media) : join(pack, 'media'), {
  prefix: values.prefix ?? 'media/',
  pxPerSquare: Number(values['px-per-square'] ?? 150),
  feetPerUnit: Number(values['feet-per-unit'] ?? 5),
  ...(values.include && { include: new RegExp(values.include) }),
  ...(values.top && { top: topFolders(values.top) }),
  ...(index && typeof index === 'object' && { index }),
  ...(pxUsage && typeof pxUsage === 'object' && { usage: pxUsage }),
  source: values.source ?? 'baileywiki',
});
const out = values.out ? typedPath(values.out) : join(pack, 'catalog.json');
await writeFile(out, JSON.stringify(catalog));
const count = (k: string) => catalog.assets.filter((a) => a.kind === k).length;
console.log(
  `Wrote ${out}: ${count('tile')} tiles, ${count('texture')} textures, ${count('model')} models ` +
    `in ${Math.round((Date.now() - started) / 1000)} s.`,
);
