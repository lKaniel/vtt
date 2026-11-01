import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The engine (core and shared) knows nothing of any game system: no hit
// points, monsters or spells. Those live in a system package such as
// packages/system-dnd5e, which the engine reaches only through
// SystemDefinition (core/src/system.ts).

const ENGINE = ['../../core/src', '.'].map((dir) => join(import.meta.dirname, dir));
const sources = ENGINE.flatMap((dir) =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => ({ file: f, text: readFileSync(join(dir, f), 'utf8') })),
);

/** Words of the D&D rules that engine code (outside comments) must not use. */
const RULES_WORDS = /\b(monsters?|spells?|stats|srd\w*|Edition|hp|inventory|concentration)\b/;

/** The code without its comments (block comment lines start with `/**` or `*`). */
const code = (text: string) =>
  text
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .map((line) => line.split(' // ')[0])
    .join('\n');

describe('the engine', () => {
  it('never imports a system package', () => {
    const offenders = sources.filter((s) => s.text.includes("from '@vtt/system-")).map((s) => s.file);
    expect(offenders).toEqual([]);
  });

  it('has no D&D words in its code', () => {
    const offenders = sources.flatMap((s) => {
      const hit = RULES_WORDS.exec(code(s.text));
      return hit ? [`${s.file}: ${hit[0]}`] : [];
    });
    expect(offenders).toEqual([]);
  });
});
