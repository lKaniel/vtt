import { migrateActorsFolder } from './migrate-actors.ts';
import { migrateOwnershipFolder } from './migrate-ownership.ts';
import { migrateFolder } from './migrate-world.ts';
import { gameDirFromArgs } from './paths.ts';

// Moves a world folder in the old layout (world.json, chunks/, tokens/) to
// the game layout, in place, keeping the old files in .v1-backup/, then
// gives the creatures on the map actors (format 3, backup in .v2-backup/)
// and moves controllers and observers to ownership levels (format 4, backup
// in .v3-backup/):
// `pnpm migrate-world [folder] [--game <id>] [--scene <id>]`. The server
// does the same on start.

const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

const dir = gameDirFromArgs();
const result = await migrateFolder(dir, { gameId: flag('game'), sceneId: flag('scene') });
if (!result) console.log(`${dir} is already in the game layout`);
else {
  for (const note of result.notes) console.log(note);
  console.log(`${dir}: migrated, old files kept in ${result.backup}`);
}
const split = await migrateActorsFolder(dir);
if (!split) console.log(`${dir}: actors are already split from tokens`);
else {
  for (const note of split.notes) console.log(note);
  console.log(`${dir}: creatures on the map now have actors, old files kept in ${split.backup}`);
}
const owned = await migrateOwnershipFolder(dir);
if (owned) console.log(`${dir}: controllers and observers are now ownership levels, old files kept in ${owned.backup}`);
