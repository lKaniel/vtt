import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Every control on a screen comes from the kit: a bare <button>, <input>,
// <select> or <textarea> outside it has no focus ring and no kit slot.

const SRC = join(import.meta.dirname, '..', '..');
const KIT = join(SRC, 'ui', 'kit');
const BARE = /<(button|input|select|textarea)[\s>]/;

function screens(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return path === KIT ? [] : screens(path);
    return entry.name.endsWith('.tsx') ? [path] : [];
  });
}

function bareControls(file: string): string[] {
  return readFileSync(file, 'utf8')
    .split('\n')
    .flatMap((line, i) => (BARE.test(line) ? [`${relative(SRC, file)}:${i + 1}`] : []));
}

describe('the kit', () => {
  it('makes every control on every screen', () => {
    expect(screens(SRC).flatMap(bareControls)).toEqual([]);
  });
});
