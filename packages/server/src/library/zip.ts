import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';

// Zip archives for exporting and importing a whole game: the plain zip
// format (no zip64, no encryption), stored or deflated. Small enough to keep
// here instead of adding a dependency.

export interface ZipEntry {
  /** Forward slashes, relative to the archive's root. */
  path: string;
  data: Buffer;
}

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;
const STORED = 0;
const DEFLATED = 8;
/** UTF-8 names. */
const UTF8 = 0x0800;
/** The zip's DOS date for 1980-01-01, as every entry is dated. */
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

/** A zip of `entries`: each deflated unless that makes it no smaller. */
export function zip(entries: readonly ZipEntry[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.path, 'utf8');
    const packed = deflateRawSync(entry.data);
    const deflate = packed.length < entry.data.length;
    const body = deflate ? packed : entry.data;
    const head = header(entry, { name, size: body.length, method: deflate ? DEFLATED : STORED });
    parts.push(local(head, name), body);
    central.push(centralEntry(head, name, offset));
    offset += 30 + name.length + body.length;
  }
  const dir = Buffer.concat(central);
  return Buffer.concat([...parts, dir, endRecord(entries.length, dir.length, offset)]);
}

interface Head {
  method: number;
  crc: number;
  size: number;
  raw: number;
}

function header(entry: ZipEntry, { name, size, method }: { name: Buffer; size: number; method: number }): Head {
  if (name.length > 0xffff) throw new Error(`zip: path too long: ${entry.path.slice(0, 40)}…`);
  return { method, crc: crc32(entry.data), size, raw: entry.data.length };
}

/** The fields local and central headers share, from "version needed" on. */
function common(head: Head, name: Buffer): Buffer {
  const b = Buffer.alloc(26);
  b.writeUInt16LE(20, 0);
  b.writeUInt16LE(UTF8, 2);
  b.writeUInt16LE(head.method, 4);
  b.writeUInt16LE(0, 6);
  b.writeUInt16LE(DOS_DATE, 8);
  b.writeUInt32LE(head.crc >>> 0, 10);
  b.writeUInt32LE(head.size, 14);
  b.writeUInt32LE(head.raw, 18);
  b.writeUInt16LE(name.length, 22);
  b.writeUInt16LE(0, 24);
  return b;
}

function local(head: Head, name: Buffer): Buffer {
  const sig = Buffer.alloc(4);
  sig.writeUInt32LE(LOCAL, 0);
  return Buffer.concat([sig, common(head, name), name]);
}

function centralEntry(head: Head, name: Buffer, offset: number): Buffer {
  const start = Buffer.alloc(6);
  start.writeUInt32LE(CENTRAL, 0);
  start.writeUInt16LE(20, 4);
  const tail = Buffer.alloc(14);
  tail.writeUInt32LE(offset, 10);
  return Buffer.concat([start, common(head, name), tail, name]);
}

function endRecord(count: number, size: number, offset: number): Buffer {
  const b = Buffer.alloc(22);
  b.writeUInt32LE(END, 0);
  b.writeUInt16LE(count, 8);
  b.writeUInt16LE(count, 10);
  b.writeUInt32LE(size, 12);
  b.writeUInt32LE(offset, 16);
  return b;
}

/** Everything in a zip, read through its central directory. Folders are left out. */
export function unzip(buf: Buffer, { maxBytes = 1024 ** 3 }: { maxBytes?: number } = {}): ZipEntry[] {
  const end = findEnd(buf);
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const out: ZipEntry[] = [];
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(at) !== CENTRAL) throw new Error('This is not a zip file (bad directory).');
    const entry = readEntry(buf, at, maxBytes - total);
    at += 46 + buf.readUInt16LE(at + 28) + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
    if (!entry) continue;
    total += entry.data.length;
    out.push(entry);
  }
  return out;
}

/** The end-of-directory record, searched for from the back (past a comment). */
function findEnd(buf: Buffer): number {
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === END) return i;
  }
  throw new Error('This is not a zip file.');
}

/** The entry whose central header is at `at`; undefined for a folder. */
function readEntry(buf: Buffer, at: number, room: number): ZipEntry | undefined {
  const method = buf.readUInt16LE(at + 10);
  const size = buf.readUInt32LE(at + 20);
  const raw = buf.readUInt32LE(at + 24);
  const nameLength = buf.readUInt16LE(at + 28);
  const path = buf.toString('utf8', at + 46, at + 46 + nameLength);
  if (path.endsWith('/')) return undefined;
  checkPath(path);
  if (raw > room) throw new Error('This archive unpacks too large.');
  const offset = buf.readUInt32LE(at + 42);
  const start = offset + 30 + buf.readUInt16LE(offset + 26) + buf.readUInt16LE(offset + 28);
  return { path, data: inflate(buf.subarray(start, start + size), method, raw) };
}

function inflate(body: Buffer, method: number, raw: number): Buffer {
  if (method === STORED) return Buffer.from(body);
  if (method !== DEFLATED) throw new Error('This zip uses a compression this server cannot read.');
  return inflateRawSync(body, { maxOutputLength: Math.max(raw, 1) });
}

/** A path inside the archive's folder: relative, forward slashes, no `..`. */
function checkPath(path: string): void {
  const parts = path.split('/');
  const bad = path.startsWith('/') || /[\\:]/.test(path) || parts.some((p) => p === '..' || p === '');
  if (bad) throw new Error(`This archive has a path that leaves its folder: ${path}`);
}
