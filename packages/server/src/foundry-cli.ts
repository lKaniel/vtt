import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { importFoundry } from './foundry-import.ts';
import { dataDirFor, repoRoot } from './paths.ts';

// pnpm import-foundry <folder> [--id <pack id>] [--overwrite]
// Imports an unzipped Foundry module, world or system as an asset pack in
// the data folder's packs/ (VTT_DATA, or data/ next to the game folder).
// Turn it on for a game in the GM's Assets tab, or in game.json `packs`.

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { id: { type: 'string' }, overwrite: { type: 'boolean' } },
});
const folder = positionals[0];
if (!folder) {
  console.error(
    'Usage: pnpm import-foundry <unzipped Foundry module, world or system folder> [--id <pack id>] [--overwrite]',
  );
  process.exit(2);
}
const home = resolve(process.env.VTT_GAME ?? process.env.VTT_WORLD ?? resolve(repoRoot, 'world'));
const packsDir = join(dataDirFor(home), 'packs');
try {
  // pnpm runs the script in packages/server; the folder is relative to where it was typed.
  const from = resolve(process.env.INIT_CWD ?? process.cwd(), folder);
  const report = await importFoundry(from, packsDir, values);
  console.log(
    `Imported "${report.id}" into ${report.dir}: ${report.media} media files, ${report.scenes} scene${report.scenes === 1 ? '' : 's'}.`,
  );
  for (const line of report.skipped) console.log(`  left out: ${line}`);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
