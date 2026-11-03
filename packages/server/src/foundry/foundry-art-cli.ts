import { parseArgs } from 'node:util';
import { importFoundryArt } from './foundry-art.ts';
import { packsDirFromEnv, typedPath, usage } from '../paths.ts';

// pnpm import-foundry-art <Foundry's resources/app/public/icons> <Data/systems/dnd5e> [--id foundry-icons] [--overwrite]
// Makes a private icons pack from your own Foundry install: its core icons,
// the system's icons and tokens, and an art file that gives each SRD spell,
// item, feature and monster the picture Foundry gives it. Turn it on for a
// game in the GM's Assets tab, or in game.json `packs`.

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { id: { type: 'string' }, overwrite: { type: 'boolean' }, 'no-media': { type: 'boolean' } },
});
const [icons, system] = positionals;
if (!icons || !system)
  usage(
    'pnpm import-foundry-art <Foundry resources/app/public/icons> <Foundry Data/systems/<system>> [--id <pack id>] [--overwrite]',
  );
const packsDir = packsDirFromEnv();
try {
  const report = await importFoundryArt({ icons: typedPath(icons), system: typedPath(system) }, packsDir, {
    ...values,
    noMedia: values['no-media'],
  });
  console.log(`Made "${report.id}" in ${report.dir}: ${report.pictures} spells, items, features and monsters named.`);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
