// Converts the Open Character Format SRD packs (CC-BY-4.0) into our content
// files: every spell, class and monster of SRD 5.1 (2014) and 5.2 (2024).
//
//   npm pack @opencharacter/5e-srd-5.1 @opencharacter/5e-srd-5.2   (then untar each)
//   node --experimental-strip-types scripts/import-srd.ts <5.1 package dir> <5.2 package dir>
//
// Automation the packs don't describe (beams, summons, repeat saves...) is
// written by hand in content/srd/*-automation.json and merged at load time,
// so re-running this script never loses it.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { convertClass, convertMonster, convertSpell, ofType, type Entry, type Pack } from './srd-convert.ts';

const OUT = join(import.meta.dirname, '../content/srd');

function loadPack(dir: string): Pack {
  const release = JSON.parse(readFileSync(join(dir, 'dist/release.json'), 'utf8')) as { content: Entry[] };
  const text = JSON.parse(readFileSync(join(dir, 'dist/i18n/en.json'), 'utf8')) as Record<string, string>;
  return { entries: new Map(release.content.map((e) => [e.id, e])), text };
}

// ---- Output -------------------------------------------------------------

function write(name: string, data: object[]): void {
  writeFileSync(join(OUT, name), `${JSON.stringify(data, null, 2)}\n`);
  console.log(`${name}: ${data.length}`);
}

const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);

for (const [edition, dir] of [
  ['5.1', process.argv[2]],
  ['5.2', process.argv[3]],
] as const) {
  if (!dir) throw new Error('Usage: import-srd.ts <srd-5.1 package dir> <srd-5.2 package dir>');
  const pack = loadPack(dir);
  const sorted = (type: string) => ofType(pack, type).sort(byId);
  write(
    `spells-${edition}.json`,
    sorted('spell').map((s) => convertSpell(pack, s)),
  );
  write(
    `classes-${edition}.json`,
    sorted('class').map((c) => convertClass(pack, c)),
  );
  write(
    `monsters-${edition}.json`,
    sorted('monster').map((m) => convertMonster(pack, m)),
  );
}
