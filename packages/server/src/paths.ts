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

/** Sessions, characters and Setup's games: VTT_DATA, or a data folder next to the game folder. */
export function dataDirFor(gameDir: string): string {
  return resolve(process.env.VTT_DATA ?? resolve(dirname(gameDir), 'data'));
}

/** The installed asset packs, for the import scripts: packs/ in the home game's data folder. */
export function packsDirFromEnv(): string {
  const home = resolve(process.env.VTT_GAME ?? process.env.VTT_WORLD ?? resolve(repoRoot, 'world'));
  return resolve(dataDirFor(home), 'packs');
}

/** A path typed on the command line: pnpm runs scripts in their package, so relative to where it was typed. */
export const typedPath = (p: string) => resolve(process.env.INIT_CWD ?? process.cwd(), p);

/** Stops a script that was called wrongly, saying how to call it. */
export function usage(text: string): never {
  console.error(`Usage: ${text}`);
  process.exit(2);
}
