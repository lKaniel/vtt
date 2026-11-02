import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readLevelDb } from './leveldb.ts';
import { snappyDecompress } from './snappy.ts';
import { writeLevelDb } from './test/leveldb-writer.ts';

// test/leveldb-actors was written by classic-level (the LevelDB Foundry v11+
// uses): 600 entries compacted into a snappy-compressed table, then an
// overwrite, two deletions and a new key in the write-ahead log.
const fixture = join(import.meta.dirname, 'test', 'leveldb-actors');

describe('readLevelDb', () => {
  it('reads every live entry of the tables and the log', async () => {
    const db = await readLevelDb(fixture);
    expect(db.size).toBe(600 - 2 + 1);
    const goblin = JSON.parse(db.get('!actors!actor00000000007')!) as { name: string };
    expect(goblin.name).toBe('Goblin 7');
    expect(JSON.parse(db.get('!actors.items!actor00000000299.item299')!)).toMatchObject({ name: 'Scimitar' });
  });

  it('takes the newest write of a key and leaves deleted keys out', async () => {
    const db = await readLevelDb(fixture);
    expect(JSON.parse(db.get('!actors!actor00000000001')!)).toMatchObject({ name: 'Renamed' });
    expect(db.has('!actors!actor00000000002')).toBe(false);
    expect(db.has('!actors.items!actor00000000002.item2')).toBe(false);
    expect(JSON.parse(db.get('!actors!newone')!)).toMatchObject({ name: 'Late' });
  });

  it('reads nothing from a folder that is not a database', async () => {
    expect((await readLevelDb(join(import.meta.dirname, 'missing'))).size).toBe(0);
  });
});

describe('snappyDecompress', () => {
  it('expands literals and back-references', () => {
    // "abcabcabcd": length 10, literal "abc", copy offset 3 length 6, literal "d"
    const data = Buffer.from([10, 0x08, 0x61, 0x62, 0x63, 0x09, 0x03, 0x00, 0x64]);
    expect(snappyDecompress(data).toString()).toBe('abcabcabcd');
  });
});

describe('the test writer', () => {
  it('writes what readLevelDb reads, across log blocks', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ldb-'));
    const big = 'x'.repeat(70_000);
    await writeLevelDb(dir, { '!a!1': { big }, '!a!2': { n: 2 } });
    const db = await readLevelDb(dir);
    expect(JSON.parse(db.get('!a!1')!)).toEqual({ big });
    expect(JSON.parse(db.get('!a!2')!)).toEqual({ n: 2 });
  });
});
