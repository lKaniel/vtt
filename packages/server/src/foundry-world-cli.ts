import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { nextSeatColor } from '@vtt/shared';
import { AccountStore } from './accounts.ts';
import { GameHub } from './game-hub.ts';
import { dataDirFor, repoRoot } from './paths.ts';

// pnpm import-foundry-world <world folder> [--name <game name>] [--data <Foundry Data folder>] [--gm <account>]
// Makes a lobby game (data/games/<id>/) from a Foundry VTT world: the same as
// the lobby's "Import a Foundry world". The GM is the given account, else the
// server's admin. A running server lists the game after a restart.

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { name: { type: 'string' }, data: { type: 'string' }, gm: { type: 'string' } },
});
const folder = positionals[0];
if (!folder) {
  console.error(
    'Usage: pnpm import-foundry-world <Foundry world folder> [--name <game name>] [--data <Foundry Data folder>] [--gm <account>]',
  );
  process.exit(2);
}
const home = resolve(process.env.VTT_GAME ?? process.env.VTT_WORLD ?? resolve(repoRoot, 'world'));
const dataDir = dataDirFor(home);
try {
  const accounts = new AccountStore(dataDir);
  await accounts.load();
  const account = values.gm ? accounts.get(values.gm) : accounts.admin();
  if (!account) throw new Error(values.gm ? `No account "${values.gm}".` : 'Make an account first: it becomes the GM.');
  const hub = new GameHub({ dataDir, home, watch: false });
  await hub.load();
  // pnpm runs the script in packages/server; the folder is relative to where it was typed.
  const cwd = process.env.INIT_CWD ?? process.cwd();
  const gm = { id: account.id, name: account.name, role: 'gm' as const, color: nextSeatColor([]) };
  const { id, report: r } = await hub.importFoundry(resolve(cwd, folder), gm, {
    name: values.name,
    dataDir: values.data && resolve(cwd, values.data),
  });
  await hub.close();
  console.log(
    `Made "${r.name}" (data/games/${id}): ${r.scenes} scenes, ${r.actors} actors, ${r.tokens} tokens, ` +
      `${r.journals} journal entries, ${r.tables} tables, ${r.playlists} playlists, ${r.media} files.`,
  );
  for (const line of r.skipped) console.log(`  left out: ${line}`);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
