import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Writes a LevelDB the way Foundry v11+ leaves one before compaction: every
// entry in the write-ahead log (no tables, no MANIFEST). Tests use it to build
// Foundry worlds and compendia; readLevelDb's real-LevelDB fixture is
// test/leveldb-actors.

const BLOCK = 32768;
const HEADER = 7;

function varint(n: number): Buffer {
  const bytes: number[] = [];
  while (n >= 0x80) {
    bytes.push((n % 0x80) | 0x80);
    n = Math.floor(n / 0x80);
  }
  bytes.push(n);
  return Buffer.from(bytes);
}

const lengthPrefixed = (b: Buffer) => Buffer.concat([varint(b.length), b]);

function batch(entries: [string, string][]): Buffer {
  const head = Buffer.alloc(12);
  head.writeBigUInt64LE(1n, 0);
  head.writeUInt32LE(entries.length, 8);
  const records = entries.map(([k, v]) =>
    Buffer.concat([Buffer.from([1]), lengthPrefixed(Buffer.from(k)), lengthPrefixed(Buffer.from(v))]),
  );
  return Buffer.concat([head, ...records]);
}

/** Record types: full, first, middle, last fragment. */
function fragmentType(first: boolean, last: boolean): number {
  if (first) return last ? 1 : 2;
  return last ? 4 : 3;
}

/** One record in log format, split into fragments where it crosses a block. */
function logFile(record: Buffer): Buffer {
  const out: Buffer[] = [];
  let [pos, size] = [0, 0];
  do {
    const left = BLOCK - (size % BLOCK);
    if (left < HEADER) {
      out.push(Buffer.alloc(left));
      size += left;
      continue;
    }
    const part = record.subarray(pos, pos + left - HEADER);
    const header = Buffer.alloc(HEADER);
    header.writeUInt16LE(part.length, 4);
    header[6] = fragmentType(pos === 0, pos + part.length >= record.length);
    pos += part.length;
    out.push(header, part);
    size += HEADER + part.length;
  } while (pos < record.length);
  return Buffer.concat(out);
}

/** A LevelDB in `dir` holding `docs` as JSON, by key (`!actors!<id>`). */
export async function writeLevelDb(dir: string, docs: Record<string, unknown>): Promise<void> {
  await mkdir(dir, { recursive: true });
  const entries = Object.entries(docs).map(([k, v]): [string, string] => [k, JSON.stringify(v)]);
  await writeFile(join(dir, '000003.log'), logFile(batch(entries)));
}
