import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { Actor, Chunk, Combat, Token, World } from '@vtt/shared';
import { classify, crossCheck, parseFile, type Issue } from './files.ts';
import { worldDirFromArgs } from './paths.ts';

// Validates every file in a world folder. Run it after editing world files
// by hand or with Claude: `pnpm check-world [folder]`.

const dir = worldDirFromArgs();
const issues: Issue[] = [];
let world: World | undefined;
let combat: Combat | undefined;
const chunks = new Map<string, Chunk>();
const tokens = new Map<string, Token>();
const actors = new Map<string, Actor>();

async function walk(sub: string): Promise<string[]> {
  try {
    return (await readdir(join(dir, sub))).map((n) => `${sub}/${n}`);
  } catch {
    return [];
  }
}

const hasCombat = (await readdir(dir)).includes('combat.json');
const files = [
  'world.json',
  ...(hasCombat ? ['combat.json'] : []),
  ...(await walk('chunks')),
  ...(await walk('tokens')),
  ...(await walk('actors')),
];
for (const rel of files) {
  const kind = classify(rel);
  if (!kind) {
    issues.push({ file: rel, message: 'not a world file, ignored', warning: true });
    continue;
  }
  let text: string;
  try {
    text = await readFile(join(dir, rel), 'utf8');
  } catch {
    issues.push({ file: rel, message: 'missing' });
    continue;
  }
  const { file, errors } = parseFile(kind, text);
  for (const message of errors) issues.push({ file: rel, message });
  if (file?.kind === 'world') world = file.data;
  if (file?.kind === 'chunk') chunks.set(file.key, file.data);
  if (file?.kind === 'token') tokens.set(file.id, file.data);
  if (file?.kind === 'actor') actors.set(file.id, file.data);
  if (file?.kind === 'combat') combat = file.data;
}
if (world) issues.push(...crossCheck(world, chunks, tokens, { combat, actors }));

const errors = issues.filter((i) => !i.warning);
for (const i of issues) console.log(`${i.warning ? 'warning' : 'error  '} ${i.file}: ${i.message}`);
console.log(
  `${relative(process.cwd(), dir) || '.'}: ${chunks.size} chunks, ${tokens.size} tokens, ${actors.size} actors, ` +
    `${errors.length} errors, ${issues.length - errors.length} warnings`,
);
process.exit(errors.length ? 1 : 0);
