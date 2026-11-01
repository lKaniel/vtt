import { relative } from 'node:path';
import { checkFolder } from './game-folder.ts';
import { gameDirFromArgs } from './paths.ts';

// Validates every file in a game folder. Run it after editing game files
// by hand or with Claude: `pnpm check-game [folder]`.

const dir = gameDirFromArgs();
const { issues, state } = await checkFolder(dir);
const errors = issues.filter((i) => !i.warning);
for (const i of issues) console.log(`${i.warning ? 'warning' : 'error  '} ${i.file}: ${i.message}`);
const scenes = [...(state?.scenes.values() ?? [])];
const count = (coll: 'walls' | 'tokens') => scenes.reduce((n, s) => n + s[coll].length, 0);
console.log(
  `${relative(process.cwd(), dir) || '.'}: ${scenes.length} scenes, ${count('walls')} walls, ${count('tokens')} tokens, ` +
    `${state?.actors.size ?? 0} actors, ${errors.length} errors, ${issues.length - errors.length} warnings`,
);
process.exit(errors.length ? 1 : 0);
