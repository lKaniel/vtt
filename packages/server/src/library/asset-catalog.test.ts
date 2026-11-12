import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCatalog, glbBounds, imageSize, pxPerSquareOf } from './asset-catalog.ts';

/** A PNG header of that size (enough for imageSize). */
function png(w: number, h: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}

/** A lossless WebP header of that size. */
function webpLossless(w: number, h: number): Buffer {
  const b = Buffer.alloc(30);
  b.write('RIFF', 0, 'latin1');
  b.write('WEBPVP8L', 8, 'latin1');
  b[20] = 0x2f;
  const bits = (w - 1) | ((h - 1) << 14);
  b.writeUInt32LE(bits >>> 0, 21);
  return b;
}

/** An extended WebP header of that size. */
function webpExtended(w: number, h: number): Buffer {
  const b = Buffer.alloc(30);
  b.write('RIFF', 0, 'latin1');
  b.write('WEBPVP8X', 8, 'latin1');
  b.writeUIntLE(w - 1, 24, 3);
  b.writeUIntLE(h - 1, 27, 3);
  return b;
}

/** A .glb whose one mesh spans the box, moved by its node. */
function glb(min: number[], max: number[], translation = [0, 0, 0]): Buffer {
  const json = {
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, translation }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ min, max }],
  };
  let text = JSON.stringify(json);
  while (text.length % 4) text += ' ';
  const head = Buffer.alloc(20);
  head.write('glTF', 0, 'latin1');
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(20 + text.length, 8);
  head.writeUInt32LE(text.length, 12);
  head.write('JSON', 16, 'latin1');
  return Buffer.concat([head, Buffer.from(text, 'latin1')]);
}

describe('reading sizes', () => {
  it('reads PNG and WebP sizes from their headers', () => {
    expect(imageSize(png(300, 150))).toEqual({ w: 300, h: 150 });
    expect(imageSize(webpLossless(4096, 2048))).toEqual({ w: 4096, h: 2048 });
    expect(imageSize(webpExtended(450, 600))).toEqual({ w: 450, h: 600 });
    expect(imageSize(Buffer.from('not a picture'))).toBeUndefined();
  });

  it('reads a model’s bounds through its nodes', () => {
    expect(glbBounds(glb([-1, 0, -2], [1, 3, 2], [5, 0, 0]))).toEqual({ min: [4, 0, -2], max: [6, 3, 2] });
  });
});

describe('the scale of a picture', () => {
  const usage = { 'a/trees/oak.webp': 120, 'a/trees/': 100, 'a/': 300 };

  it('is how scenes use it, else its folder, else its name, else the default', () => {
    const o = { pxPerSquare: 150, usage };
    expect(pxPerSquareOf('a/trees/oak.webp', o)).toBe(120);
    expect(pxPerSquareOf('modules/a/trees/pine.webp', o)).toBe(100);
    expect(pxPerSquareOf('a/rocks/big.webp', o)).toBe(300);
    expect(pxPerSquareOf('b/bush01-200dpi.webp', o)).toBe(200);
    expect(pxPerSquareOf('b/bush.webp', o)).toBe(150);
  });
});

describe('building a catalog', () => {
  async function pack(files: Record<string, Buffer>): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'catalog-'));
    for (const [path, body] of Object.entries(files)) {
      await mkdir(dirname(join(dir, path)), { recursive: true });
      await writeFile(join(dir, path), body);
    }
    return dir;
  }

  it('sizes tiles by pixels per square, textures and models in feet, and skips thumbnails', async () => {
    const dir = await pack({
      'media/wilderness/trees/bw_tree_oak_01.webp': webpExtended(900, 750),
      'media/wilderness/trees/bw_tree_oak_01_thumb.webp': webpExtended(90, 75),
      'media/wilderness/forest/bw-forest-01-4k-tileable.webp': webpLossless(4050, 4050),
      'media/scenes/thumbs/a.webp': png(10, 10),
      'media/models/trees/oak.glb': glb([-1, 0, -1], [1, 4, 1]),
      'media/models/trees/oak.webp': png(256, 256),
      'media/models/trees/zz-textures/T_Bark_C.webp': png(1024, 1024),
      'media/textures/grass-pbr/grass_2K_NormalGL.jpg': png(1024, 1024),
      'media/maps/forest-path-splatmap.webp': png(1024, 1024),
    });
    const catalog = await buildCatalog(join(dir, 'media'), { prefix: 'media/', pxPerSquare: 150, feetPerUnit: 5 });
    const byId = Object.fromEntries(catalog.assets.map((a) => [a.id, a]));
    expect(Object.keys(byId).sort()).toEqual(['bw-forest-01-4k-tileable', 'bw-tree-oak-01', 'oak']);
    expect(byId['bw-tree-oak-01']).toMatchObject({ kind: 'tile', w: 30, h: 25, overhead: true });
    expect(byId['bw-forest-01-4k-tileable']).toMatchObject({ kind: 'texture', w: 135, h: 135 });
    expect(byId['oak']).toMatchObject({
      kind: 'model',
      src: 'media/models/trees/oak.glb',
      w: 10,
      h: 10,
      height: 20,
      thumb: 'media/models/trees/oak.webp',
    });
    expect(byId['oak']!.tags).toContain('trees');
  });

  it('gives a second file of the same name its folder in its id, and takes tags from an index', async () => {
    const dir = await pack({
      'media/a/rock.webp': png(150, 150),
      'media/b/rock.webp': png(300, 300),
    });
    const catalog = await buildCatalog(join(dir, 'media'), {
      prefix: 'media/',
      index: { 'media/b/rock.webp': { tags: ['Boulder', 'Grey'] } },
    });
    expect(catalog.assets.map((a) => a.id)).toEqual(['rock', 'b-rock']);
    expect(catalog.assets[1]!.tags).toEqual(expect.arrayContaining(['boulder', 'grey']));
  });

  it('keeps one of the same file shipped twice (a free and a premium module)', async () => {
    const dir = await pack({
      'media/free/maps/oak.webp': png(300, 300),
      'media/premium/maps/oak.webp': png(300, 300),
      'media/premium/maps/big/oak.webp': png(600, 600),
    });
    const catalog = await buildCatalog(join(dir, 'media'), { prefix: 'media/' });
    expect(catalog.assets.map((a) => a.src)).toEqual(['media/free/maps/oak.webp', 'media/premium/maps/big/oak.webp']);
  });

  it('keeps only the folders asked for', async () => {
    const dir = await pack({ 'media/keep/a.png': png(150, 150), 'media/drop/b.png': png(150, 150) });
    const catalog = await buildCatalog(join(dir, 'media'), { prefix: 'media/', include: /^keep\// });
    expect(catalog.assets.map((a) => a.id)).toEqual(['a']);
    const top = await buildCatalog(join(dir, 'media'), { prefix: 'media/', top: (f) => f.startsWith('dr') });
    expect(top.assets.map((a) => a.id)).toEqual(['b']);
  });
});
