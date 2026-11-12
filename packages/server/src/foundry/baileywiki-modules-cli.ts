import { parseArgs } from 'node:util';
import { importBaileywikiModules } from './baileywiki-modules.ts';
import { packsDirFromEnv, typedPath, usage } from '../paths.ts';

// pnpm import-baileywiki "<Foundry data>/Data/modules" [--module <id>]... [--with <id>]... [--link]
// Imports the Baileywiki modules installed in Foundry (every baileywiki-*
// folder, or the --module ones, plus the --with ones their scenes use) into the `baileywiki` pack in the data
// folder's packs/: media, scenes, prefabs and Baileywiki's file tags.
// Running it again copies only new or changed files. --link hard-links the
// files instead of copying them when the pack is on the same drive.

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    module: { type: 'string', multiple: true },
    with: { type: 'string', multiple: true },
    link: { type: 'boolean' },
    quiet: { type: 'boolean' },
  },
});
const folder = positionals[0];
if (!folder) usage('pnpm import-baileywiki "<Foundry data>/Data/modules" [--module <id>]... [--with <id>]... [--link]');
try {
  const report = await importBaileywikiModules(typedPath(folder), packsDirFromEnv(), {
    ...(values.module ? { modules: values.module } : {}),
    ...(values.with ? { with: values.with } : {}),
    link: values.link,
    ...(values.quiet ? {} : { log: (line: string) => console.log(line) }),
  });
  console.log(
    `Imported ${report.modules.length} modules into ${report.dir}: ${report.media} media files (${report.copied} new), ${report.scenes} scenes, ${report.prefabs} prefabs.`,
  );
  for (const line of report.skipped) console.log(`  left out: ${line}`);
  if (report.missing.length) console.log(`The missing files are listed in ${report.dir}/missing-files.txt.`);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
