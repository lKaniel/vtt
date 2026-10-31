import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

/** World folder from the first CLI argument, VTT_WORLD, or the repo's example world. */
export function worldDirFromArgs(): string {
  return resolve(process.argv[2] ?? process.env.VTT_WORLD ?? resolve(repoRoot, 'world'));
}

/** Accounts and characters: VTT_DATA, or a data folder next to the world folder. */
export function dataDirFor(worldDir: string): string {
  return resolve(process.env.VTT_DATA ?? resolve(dirname(worldDir), 'data'));
}
