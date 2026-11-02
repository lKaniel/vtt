import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { unzip, zip } from './zip.ts';

const text = (s: string) => Buffer.from(s, 'utf8');

describe('zip', () => {
  it('reads back what it wrote, compressed or not', () => {
    const entries = [
      { path: 'game.json', data: text('{"id":"lost-mine"}') },
      { path: 'scenes/main/tokens.json', data: text('[]'.repeat(500)) },
      { path: 'assets/empty.txt', data: Buffer.alloc(0) },
    ];
    expect(unzip(zip(entries))).toEqual(entries);
  });

  it('reads an archive made by another tool', async () => {
    let made: Buffer;
    const dir = await mkdtemp(join(tmpdir(), 'vtt-zip-'));
    await writeFile(join(dir, 'a.json'), '{"a":1}'.repeat(100));
    try {
      // eslint-disable-next-line sonarjs/no-os-command-from-path -- a test: python's zipfile writes the archive
      execFileSync('python3', ['-c', ZIP_PY, dir], { stdio: 'ignore' });
      made = await readFile(join(dir, 'out.zip'));
    } catch {
      return; // No python here: the round trip above still runs.
    }
    expect(unzip(made)).toEqual([{ path: 'a.json', data: text('{"a":1}'.repeat(100)) }]);
  });

  it('refuses paths that leave the folder', () => {
    for (const path of ['../evil.json', '/etc/passwd', 'a/../../b', 'c:\\x']) {
      expect(() => unzip(zip([{ path, data: text('x') }]))).toThrow(/path/);
    }
  });

  it('refuses archives that unpack too large', () => {
    const big = zip([{ path: 'big.bin', data: Buffer.alloc(100_000) }]);
    expect(() => unzip(big, { maxBytes: 50_000 })).toThrow(/large/);
  });

  it('refuses what is not a zip', () => {
    expect(() => unzip(text('hello'))).toThrow(/zip/);
  });
});

const ZIP_PY = `
import sys, zipfile, os
d = sys.argv[1]
with zipfile.ZipFile(os.path.join(d, 'out.zip'), 'w', zipfile.ZIP_DEFLATED) as z:
    z.write(os.path.join(d, 'a.json'), 'a.json')
`;
