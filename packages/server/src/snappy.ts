// Snappy decompression (https://github.com/google/snappy/blob/main/format_description.txt),
// the block compression LevelDB uses, so Foundry's databases can be read
// without a native module.

/** A little-endian varint at `pos`: its value and where the next field starts. */
export function varint(buf: Uint8Array, pos: number): [value: number, next: number] {
  let value = 0;
  let shift = 0;
  for (;;) {
    const byte = buf[pos++];
    if (byte === undefined) throw new Error('varint runs past the end');
    value += (byte & 0x7f) * 2 ** shift;
    if (byte < 0x80) return [value, pos];
    shift += 7;
  }
}

const littleEndian = (buf: Uint8Array, pos: number, bytes: number) => {
  let n = 0;
  for (let i = bytes - 1; i >= 0; i--) n = n * 256 + buf[pos + i]!;
  return n;
};

/** One element's length, back-reference offset (0 for a literal) and where its data starts. */
function element(src: Uint8Array, pos: number): { len: number; offset: number; at: number } {
  const tag = src[pos]!;
  const kind = tag & 3;
  if (kind === 0) {
    const short = tag >> 2;
    if (short < 60) return { len: short + 1, offset: 0, at: pos + 1 };
    const bytes = short - 59;
    return { len: littleEndian(src, pos + 1, bytes) + 1, offset: 0, at: pos + 1 + bytes };
  }
  if (kind === 1) return { len: ((tag >> 2) & 7) + 4, offset: ((tag >> 5) << 8) | src[pos + 1]!, at: pos + 2 };
  const bytes = kind === 2 ? 2 : 4;
  return { len: (tag >> 2) + 1, offset: littleEndian(src, pos + 1, bytes), at: pos + 1 + bytes };
}

export function snappyDecompress(src: Uint8Array): Buffer {
  const [size, start] = varint(src, 0);
  const out = Buffer.alloc(size);
  let [pos, end] = [start, 0];
  while (pos < src.length) {
    const { len, offset, at } = element(src, pos);
    if (offset === 0) {
      out.set(src.subarray(at, at + len), end);
      pos = at + len;
    } else {
      if (offset > end) throw new Error('snappy back-reference before the start');
      // Byte by byte: a reference may overlap what it is writing.
      for (let i = 0; i < len; i++) out[end + i] = out[end - offset + i]!;
      pos = at;
    }
    end += len;
  }
  if (end !== size) throw new Error('snappy data is truncated');
  return out;
}
