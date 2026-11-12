import type { Doc, Op, PackAsset } from '@vtt/core';
import { describe, expect, it } from 'vitest';
import { assetQueries } from './blueprint-assets.ts';
import { BlueprintSchema, blueprintBuild, type BlueprintContext } from './scene-blueprint.ts';

// Map pieces from the game's asset catalogs (a Baileywiki pack): a tree or a
// wagon placed by name at its real size, a stretch of forest scattered with
// them, and ground and floors in the pack's tileable textures.

const asset = (id: string, kind: PackAsset['kind'], [w, h]: [number, number], extra: Partial<PackAsset> = {}) => ({
  id,
  src: `pack://bw/media/${id}.${kind === 'model' ? 'glb' : 'webp'}`,
  kind,
  name: id.replace(/-/g, ' '),
  tags: id.split('-'),
  w,
  h,
  pack: 'bw',
  ...extra,
});

const ASSETS: PackAsset[] = [
  asset('oak-tree-01', 'tile', [30, 30], { overhead: true }),
  asset('oak-tree-02', 'tile', [25, 25], { overhead: true }),
  asset('wagon-cart', 'tile', [10, 15]),
  asset('grass-tileable', 'texture', [135, 135]),
  asset('wood-floor-tileable', 'texture', [50, 50]),
  asset('oak-tree-3d', 'model', [20, 20], { height: 40 }),
];

const find = ({ search, kind }: { search: string; kind?: PackAsset['kind'] }) =>
  ASSETS.filter(
    (a) => (!kind || a.kind === kind) && (a.id === search || search.split(' ').every((w) => a.tags.includes(w))),
  );

const ctx = (extra: Partial<BlueprintContext> = {}): BlueprintContext => ({
  scene: 'wood',
  gridSize: 100,
  rules: '2014',
  taken: () => false,
  assets: find,
  ...extra,
});

const build = (bp: unknown, extra?: Partial<BlueprintContext>) => blueprintBuild(BlueprintSchema.parse(bp), ctx(extra));

const tiles = (ops: Op[]): Doc[] =>
  ops.flatMap((op) => (op.op === 'create' && op.coll === 'wood/tiles' ? [op.doc] : []));

describe('props from the catalog', () => {
  it('places a picture at its real size, centred on the point, a crown as a roof', () => {
    const [cart, oak] = tiles(
      build({
        props: [
          { asset: 'wagon-cart', x: 2, y: 2, rotation: 90 },
          { asset: 'oak tree', x: 10, y: 4, kind: 'tile' },
        ],
      }).ops,
    );
    // 10 x 15 ft is 2 x 3 squares, its middle on the middle of square (2, 2).
    expect(cart).toMatchObject({
      kind: 'image',
      src: 'pack://bw/media/wagon-cart.webp',
      x: 150,
      y: 100,
      w: 200,
      h: 300,
    });
    expect(cart).toMatchObject({ rotation: 90, name: 'wagon cart' });
    expect(oak).toMatchObject({ kind: 'image', overhead: true });
  });

  it('stands a model at its real height on a 3D scene', () => {
    const [oak] = tiles(build({ props: [{ asset: 'oak tree', x: 5, y: 5, scale: 1.5 }] }, { prefer: 'model' }).ops);
    expect(oak).toMatchObject({ src: '/art/ui/blank.svg', w: 600, h: 600 });
    expect(oak!.model).toMatchObject({ src: 'pack://bw/media/oak-tree-3d.glb', fill: 'fit', height: 60 });
  });

  it('says which words found nothing', () => {
    expect(() => build({ props: [{ asset: 'dragon hoard', x: 1, y: 1 }] })).toThrow(/dragon hoard/);
  });
});

describe('scattering', () => {
  const forest = { assets: ['oak tree'], kind: 'tile', x: 0, y: 0, w: 20, h: 20, count: 12, seed: 3 };

  it('fills an area with the assets found, kept apart, the same every time for a seed', () => {
    const first = tiles(build({ scatter: [forest] }).ops);
    expect(first).toHaveLength(12);
    expect(new Set(first.map((t) => t.src)).size).toBe(2);
    for (const t of first) {
      const [cx, cy] = [(t.x as number) + (t.w as number) / 2, (t.y as number) + (t.h as number) / 2];
      expect(cx).toBeGreaterThanOrEqual(0);
      expect(cx).toBeLessThanOrEqual(2000);
      expect(cy).toBeLessThanOrEqual(2000);
    }
    expect(tiles(build({ scatter: [forest] }).ops)).toEqual(first);
    expect(tiles(build({ scatter: [{ ...forest, seed: 4 }] }).ops)).not.toEqual(first);
  });

  it('leaves out pieces too big for the area, like a whole set of stones', () => {
    const grove = asset('oak-tree-grove', 'tile', [120, 120]);
    const placed = tiles(build({ scatter: [forest] }, { assets: (q) => [...find(q), grove] }).ops);
    expect(placed.map((t) => t.src)).not.toContain(grove.src);
  });

  it('keeps out of the boxes it is told to avoid', () => {
    const avoid = [{ x: 0, y: 0, w: 20, h: 10 }];
    const placed = tiles(build({ scatter: [{ ...forest, avoid, spacing: 1 }] }).ops);
    expect(placed.length).toBeGreaterThan(0);
    for (const t of placed) expect((t.y as number) + (t.h as number) / 2).toBeGreaterThanOrEqual(1000);
  });
});

describe('ground and floors from the catalog', () => {
  it('lays a patch of a tileable texture at its own scale', () => {
    const [grass] = tiles(build({ grounds: [{ texture: 'grass', x: 0, y: 0, w: 30, h: 30 }] }).ops);
    expect(grass).toMatchObject({ kind: 'rect', pattern: 'pack://bw/media/grass-tileable.webp', textureScale: 27 });
    expect(grass).toMatchObject({ x: 0, y: 0, w: 3000, h: 3000, edge: 'rough', color: '#ffffff' });
  });

  it('floors rooms with the pack’s texture when it has one, else paints them', () => {
    const [wood, sand] = tiles(
      build({
        rooms: [
          { name: 'Hall', x: 0, y: 0, w: 4, h: 4, floor: 'wood' },
          { name: 'Pit', x: 5, y: 0, w: 2, h: 2, floor: 'sand' },
        ],
      }).ops,
    );
    expect(wood).toMatchObject({ kind: 'rect', pattern: 'pack://bw/media/wood-floor-tileable.webp', textureScale: 10 });
    expect(sand).toMatchObject({ kind: 'rect', texture: 'sand' });
  });
});

describe('what a blueprint asks the catalog', () => {
  it('lists each search once with the kind it needs', () => {
    const bp = BlueprintSchema.parse({
      props: [{ asset: 'wagon', x: 1, y: 1 }],
      scatter: [{ assets: ['oak tree', 'wagon'], x: 0, y: 0, w: 5, h: 5 }],
      grounds: [{ texture: 'grass', x: 0, y: 0, w: 5, h: 5 }],
      rooms: [{ x: 0, y: 0, w: 2, h: 2, floor: 'wood' }],
    });
    expect(assetQueries(bp, 'tile')).toEqual([
      { search: 'wagon', kind: 'tile' },
      { search: 'oak tree', kind: 'tile' },
      { search: 'grass', kind: 'texture' },
      { search: 'wood', kind: 'texture' },
    ]);
  });
});
