import { join, relative } from 'node:path';
import { checkFolder } from './store/game-folder.ts';
import { readGameFile } from './library/game-hub.ts';
import { gamePluginIssues } from './library/game-plugins.ts';
import { PackStore } from './library/pack-store.ts';
import { PluginStore } from './library/plugin-store.ts';
import { dataDirFor, gameDirFromArgs } from './paths.ts';

// Validates every file in a game folder. Run it after editing game files
// by hand or with Claude: `pnpm check-game [folder]`.

const dir = gameDirFromArgs();
// The packs installed next to it, so tokens may use their monsters.
const packs = new PackStore(join(dataDirFor(dir), 'packs'));
await packs.load();
for (const problem of packs.problems) console.log(`warning packs/${problem}`);
// And its plugins, so a game naming one this server lacks says so.
const plugins = new PluginStore(join(dataDirFor(dir), 'plugins'));
await plugins.load();
for (const problem of plugins.problems) console.log(`warning plugins/${problem}`);
const gameFile = await readGameFile(dir);
for (const issue of gameFile ? gamePluginIssues(plugins, gameFile) : []) console.log(`warning game.json: ${issue}`);
const { issues, state } = await checkFolder(dir, packs);
const errors = issues.filter((i) => !i.warning);
for (const i of issues) console.log(`${i.warning ? 'warning' : 'error  '} ${i.file}: ${i.message}`);
const scenes = [...(state?.scenes.values() ?? [])];
const count = (coll: 'walls' | 'tokens') => scenes.reduce((n, s) => n + s[coll].length, 0);
console.log(
  `${relative(process.cwd(), dir) || '.'}: ${scenes.length} scenes, ${count('walls')} walls, ${count('tokens')} tokens, ` +
    `${state?.actors.size ?? 0} actors, ${errors.length} errors, ${issues.length - errors.length} warnings`,
);
process.exit(errors.length ? 1 : 0);
