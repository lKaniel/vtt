import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

/**
 * Game folder from the first CLI argument (that isn't a --flag), VTT_GAME,
 * VTT_WORLD (its old name), or the repo's example game in world/.
 */
export function gameDirFromArgs(): string {
  const arg = process.argv.slice(2).find((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'));
  return resolve(arg ?? process.env.VTT_GAME ?? process.env.VTT_WORLD ?? resolve(repoRoot, 'world'));
}

/** Accounts and characters: VTT_DATA, or a data folder next to the game folder. */
export function dataDirFor(gameDir: string): string {
  return resolve(process.env.VTT_DATA ?? resolve(dirname(gameDir), 'data'));
}
