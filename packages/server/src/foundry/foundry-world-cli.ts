import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { FIRST_GM } from '@vtt/shared';
import { leftOutLine } from './import-losses.ts';
import { GameHub } from '../library/game-hub.ts';
import { dataDirFor, repoRoot } from '../paths.ts';

// pnpm import-foundry-world <world folder> [--name <game name>] [--data <Foundry Data folder>]
// Makes a lobby game (data/games/<id>/) from a Foundry VTT world: the same as
// Setup's "Import a Foundry world". Its GM is a "Gamemaster" player without a
// password. A running server lists the game after a restart.

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { name: { type: 'string' }, data: { type: 'string' } },
});
const folder = positionals[0];
if (!folder) {
  console.error(
    'Usage: pnpm import-foundry-world <Foundry world folder> [--name <game name>] [--data <Foundry Data folder>]',
  );
  process.exit(2);
}
const home = resolve(process.env.VTT_GAME ?? process.env.VTT_WORLD ?? resolve(repoRoot, 'world'));
const dataDir = dataDirFor(home);
try {
  const hub = new GameHub({ dataDir, home, watch: false });
  await hub.load();
  // pnpm runs the script in packages/server; the folder is relative to where it was typed.
  const cwd = process.env.INIT_CWD ?? process.cwd();
  const { id, report: r } = await hub.importFoundry(resolve(cwd, folder), FIRST_GM, {
    name: values.name,
    dataDir: values.data && resolve(cwd, values.data),
  });
  await hub.close();
  console.log(
    `Made "${r.name}" (data/games/${id}): ${r.scenes} scenes, ${r.actors} actors, ${r.tokens} tokens, ` +
      `${r.journals} journal entries, ${r.tables} tables, ${r.playlists} playlists, ${r.media} files.`,
  );
  for (const l of r.left) console.log(`  left out: ${leftOutLine(l)}`);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
