import { migrateActorsFolder } from './migrate-actors.ts';
import { migrateFoldersFolder } from './migrate-folders.ts';
import { migrateOwnershipFolder } from './migrate-ownership.ts';
import { migrateFolder } from './migrate-world.ts';

/** Moves a game folder up to the current format, one step at a time, saying what it did. */
export async function upgradeFolder(dir: string): Promise<void> {
  const migrated = await migrateFolder(dir);
  if (migrated) {
    console.log(`[game] moved the old world files to the game layout; originals kept in ${migrated.backup}`);
    for (const note of migrated.notes) console.log(`[game]   ${note}`);
  }
  const split = await migrateActorsFolder(dir);
  if (split) {
    console.log(`[game] gave the creatures on the map actors (format 3); originals kept in ${split.backup}`);
    for (const note of split.notes) console.log(`[game]   ${note}`);
  }
  const owned = await migrateOwnershipFolder(dir);
  if (owned) console.log(`[game] creatures have ownership levels now (format 4); originals kept in ${owned.backup}`);
  const filed = await migrateFoldersFolder(dir);
  if (filed?.backup)
    console.log(`[game] made ${filed.folders} sidebar folders (format 5); originals kept in ${filed.backup}`);
}
