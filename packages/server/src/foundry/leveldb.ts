import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { snappyDecompress, varint } from './snappy.ts';

// A read-only LevelDB reader: Foundry VTT v11 and later keep every world
// collection and compendium in a LevelDB folder. It reads the table files
// (.ldb, .sst) the MANIFEST says are live and the write-ahead logs, and
// keeps the newest write of each key, so it needs neither a native module
// nor Foundry, works while Foundry has the database open, and never writes.
// Formats: https://github.com/google/leveldb/blob/main/doc/table_format.md
// and log_format.md.

interface Write {
  seq: number;
  /** undefined for a deletion. */
  value: Buffer | undefined;
}
type Writes = Map<string, Write>;

const BLOCK = 32768;
const HEADER = 7;
const RECORD = { full: 1, first: 2, middle: 3, last: 4 };

/** The records of a log-format file (the logs and the MANIFEST). */
function logRecords(buf: Buffer): Buffer[] {
  const out: Buffer[] = [];
  let parts: Buffer[] = [];
  let pos = 0;
  while (pos + HEADER <= buf.length) {
    const left = BLOCK - (pos % BLOCK);
    if (left < HEADER) {
      pos += left;
      continue;
    }
    const len = buf.readUInt16LE(pos + 4);
    const type = buf[pos + 6]!;
    const data = buf.subarray(pos + HEADER, pos + HEADER + len);
    pos += HEADER + len;
    if (type === 0 || data.length < len) break;
    if (type === RECORD.full || type === RECORD.first) parts = [];
    parts.push(data);
    if (type === RECORD.full || type === RECORD.last) out.push(Buffer.concat(parts));
  }
  return out;
}

/** A varint-prefixed byte string at `pos`. */
function slice(buf: Buffer, pos: number): [Buffer, number] {
  const [len, at] = varint(buf, pos);
  return [buf.subarray(at, at + len), at + len];
}

function put(writes: Writes, key: string, write: Write): void {
  const had = writes.get(key);
  if (!had || had.seq <= write.seq) writes.set(key, write);
}

/** Applies one WriteBatch from a log: sequence, count, then puts and deletes. */
function applyBatch(batch: Buffer, writes: Writes): void {
  if (batch.length < 12) return;
  const seq = Number(batch.readBigUInt64LE(0));
  const count = batch.readUInt32LE(8);
  let pos = 12;
  for (let i = 0; i < count && pos < batch.length; i++) {
    const tag = batch[pos++];
    const [key, next] = slice(batch, pos);
    pos = next;
    let value: Buffer | undefined;
    if (tag === 1) [value, pos] = slice(batch, pos);
    put(writes, key.toString('utf8'), { seq: seq + i, value });
  }
}

/** The key/value entries of one table block. */
function blockEntries(block: Buffer): [Buffer, Buffer][] {
  const restarts = block.readUInt32LE(block.length - 4);
  const end = block.length - 4 * (restarts + 1);
  const out: [Buffer, Buffer][] = [];
  let key = Buffer.alloc(0);
  let pos = 0;
  while (pos < end) {
    const [shared, a] = varint(block, pos);
    const [own, b] = varint(block, a);
    const [size, c] = varint(block, b);
    key = Buffer.concat([key.subarray(0, shared), block.subarray(c, c + own)]);
    out.push([key, block.subarray(c + own, c + own + size)]);
    pos = c + own + size;
  }
  return out;
}

/** The block a handle (offset, size) points at, decompressed. */
function readBlock(file: Buffer, handle: Buffer, at = 0): Buffer {
  const [offset, next] = varint(handle, at);
  const [size] = varint(handle, next);
  const data = file.subarray(offset, offset + size);
  const compression = file[offset + size];
  if (compression === 0) return data;
  if (compression === 1) return snappyDecompress(data);
  throw new Error(`table block compressed with an unknown method (${compression})`);
}

/** Every write in a table file: its index block points at its data blocks. */
function applyTable(file: Buffer, writes: Writes): void {
  const footer = file.subarray(file.length - 48);
  const [, afterMeta] = varint(footer, varint(footer, 0)[1]);
  for (const [, handle] of blockEntries(readBlock(file, footer, afterMeta))) {
    for (const [internal, value] of blockEntries(readBlock(file, handle))) {
      const trailer = internal.readBigUInt64LE(internal.length - 8);
      const key = internal.subarray(0, internal.length - 8).toString('utf8');
      put(writes, key, { seq: Number(trailer >> 8n), value: (trailer & 0xffn) === 1n ? value : undefined });
    }
  }
}

interface Live {
  tables: Set<number>;
  /** Logs older than this are already in the tables. */
  minLog: number;
}

/** One VersionEdit's changes to the live files. */
function applyEdit(edit: Buffer, live: Live): void {
  let pos = 0;
  const num = () => {
    const [n, next] = varint(edit, pos);
    pos = next;
    return n;
  };
  const skip = () => {
    pos = slice(edit, pos)[1];
  };
  const fields: Record<number, () => void> = {
    1: skip,
    2: () => {
      live.minLog = num();
    },
    3: num,
    4: num,
    5: () => {
      num();
      skip();
    },
    6: () => {
      num();
      live.tables.delete(num());
    },
    7: () => {
      num();
      live.tables.add(num());
      num();
      skip();
      skip();
    },
    9: num,
  };
  while (pos < edit.length) {
    const field = fields[num()];
    if (!field) return;
    field();
  }
}

/** The live table files and logs, from the MANIFEST that CURRENT names; undefined if it can't be read. */
async function liveFiles(dir: string): Promise<Live | undefined> {
  try {
    const current = (await readFile(join(dir, 'CURRENT'), 'utf8')).trim();
    const live: Live = { tables: new Set(), minLog: 0 };
    for (const edit of logRecords(await readFile(join(dir, current)))) applyEdit(edit, live);
    return live;
  } catch {
    return undefined;
  }
}

const KINDS: Record<string, 'table' | 'log'> = { ldb: 'table', sst: 'table', log: 'log' };

const fileNumber = (name: string) => Number(name.split('.')[0]);

/** Whether a file holds data we should read: every table and log when there is no MANIFEST. */
function isLive(name: string, live: Live | undefined): 'table' | 'log' | undefined {
  const kind = KINDS[/^\d+\.(\w+)$/.exec(name)?.[1] ?? ''];
  if (!kind || !live) return kind;
  if (kind === 'table') return live.tables.has(fileNumber(name)) ? kind : undefined;
  return fileNumber(name) >= live.minLog ? kind : undefined;
}

/** Every live key of the LevelDB in `dir` with its value as text; empty when there is none. */
export async function readLevelDb(dir: string): Promise<Map<string, string>> {
  const names = await readdir(dir).catch(() => [] as string[]);
  const live = await liveFiles(dir);
  const writes: Writes = new Map();
  for (const name of names) {
    const kind = isLive(name, live);
    if (!kind) continue;
    const file = await readFile(join(dir, name));
    if (kind === 'table') applyTable(file, writes);
    else for (const batch of logRecords(file)) applyBatch(batch, writes);
  }
  const out = new Map<string, string>();
  for (const [key, { value }] of writes) if (value) out.set(key, value.toString('utf8'));
  return out;
}
