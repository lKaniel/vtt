import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { FIRST_GM, type FoundryImportReport } from '@vtt/shared';
import { reportLines } from './import-losses.ts';
import { GameHub } from '../library/game-hub.ts';
import { dataDirFor, repoRoot } from '../paths.ts';

// pnpm import-foundry-world <world folder> [--name <game name>] [--data <Foundry Data folder>]
// pnpm import-foundry-world [<world folder>] --into <game id> [--data <Foundry Data folder>]
// Makes a lobby game (data/games/<id>/) from a Foundry VTT world: the same as
// Setup's "Import a Foundry world". Its GM is a "Gamemaster" player without a
// password. With --into, imports the world again into the game it made
// (from the folder it came from last time unless one is given), keeping the
// scenes and everything else made in the VTT since (foundry-reimport.ts).
// Stop the server first, or it keeps the old game in memory.

const USAGE =
  'Usage: pnpm import-foundry-world <Foundry world folder> [--name <game name>] [--data <Foundry Data folder>]\n' +
  '       pnpm import-foundry-world [<Foundry world folder>] --into <game id> [--data <Foundry Data folder>]';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { name: { type: 'string' }, data: { type: 'string' }, into: { type: 'string' } },
});
const folder = positionals[0];
if (!folder && !values.into) {
  console.error(USAGE);
  process.exit(2);
}
const home = resolve(process.env.VTT_GAME ?? process.env.VTT_WORLD ?? resolve(repoRoot, 'world'));
const dataDir = dataDirFor(home);
// pnpm runs the script in packages/server; the folders are relative to where it was typed.
const cwd = process.env.INIT_CWD ?? process.cwd();
const from = folder && resolve(cwd, folder);
const data = values.data && resolve(cwd, values.data);

const print = (id: string, r: FoundryImportReport) => console.log(reportLines(id, r).join('\n'));

try {
  const hub = new GameHub({ dataDir, home, watch: false });
  await hub.load();
  if (values.into) {
    print(values.into, await hub.reimportFoundry(values.into, FIRST_GM, { folder: from, dataDir: data }));
  } else {
    const { id, report } = await hub.importFoundry(from!, FIRST_GM, { name: values.name, dataDir: data });
    print(id, report);
  }
  await hub.close();
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
