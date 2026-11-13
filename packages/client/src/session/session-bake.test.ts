import { DocStore } from '@vtt/core';
import type { BakeManifest, WorldInfo } from '@vtt/shared';
import { describe, expect, it, vi } from 'vitest';
import { tilePrint } from '../canvas/bake-plan.ts';
import { type BakeEvents, type BakeHost, SceneBake } from './session-bake.ts';

// The GM's Optimise and Edit for a 2D scene: Optimise bakes the still
// tiles into a picture pyramid, saves it, and switches the scene to it;
// Edit switches back to every tile drawn. Everyone on an optimised scene
// loads its manifest and draws the pictures instead of the tiles in them.

const tile = { kind: 'image', id: 'floor', src: 'floor.webp', x: 0, y: 0, w: 100, h: 100 } as const;
const manifest: BakeManifest = {
  v: 1,
  block: 512,
  scale: 1,
  ext: 'webp',
  groups: [{ x: 0, y: 0, w: 100, h: 100, zooms: 1, tiles: { floor: tilePrint({ ...tile, z: 0 }) }, blocks: [['0_0']] }],
};

function setup(world: Partial<WorldInfo> = {}, gm = true) {
  const docs = new DocStore();
  docs.apply([
    { op: 'create', coll: 'cave/tiles', doc: { ...tile, type: 'tile', rev: 0 } },
    { op: 'create', coll: 'scenes', doc: { id: 'cave', type: 'scene', rev: 0 } },
  ]);
  const sent: unknown[] = [];
  const errors: string[] = [];
  const host: BakeHost = {
    world: { name: 'Cave', gridSize: 100, chunkSize: 2000, ...world } as WorldInfo,
    scene: 'cave',
    docs,
    view3d: { on: false },
    isGm: () => gm,
    send: (msg) => sent.push(msg),
    showNotice: vi.fn(),
    showError: (message) => errors.push(message),
  };
  const updates = vi.fn<BakeEvents['updates']>();
  const read = vi.fn(() => Promise.resolve(manifest));
  const run = vi.fn(async (job: { put(path: string, data: string): Promise<void> }) => {
    await job.put('manifest.json', 'e30=');
    return manifest;
  });
  const bake = new SceneBake(host, { changed: vi.fn(), updates }, { read, run });
  return { bake, host, sent, updates, read, run, errors };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('an optimised scene', () => {
  it('loads its bake and draws a baked tile from it while it is unchanged', async () => {
    const { bake, read } = setup({ bake: 'b1', optimised: true });
    bake.welcome();
    await flush();
    expect(read).toHaveBeenCalledWith('cave', 'b1');
    expect(bake.baked({ ...tile, z: 0 })).toBe(true);
    expect(bake.baked({ ...tile, z: 0, tint: '#ff0000' })).toBe(false);
  });

  it('draws every tile in edit mode, on a 3D scene and before the bake is in', async () => {
    const edit = setup({ bake: 'b1' });
    edit.bake.welcome();
    await flush();
    expect(edit.bake.baked({ ...tile, z: 0 })).toBe(false);
    expect(edit.read).not.toHaveBeenCalled();
    const loading = setup({ bake: 'b1', optimised: true });
    expect(loading.bake.baked({ ...tile, z: 0 })).toBe(false);
    const flat = setup({ bake: 'b1', optimised: true, view: '3d' });
    flat.bake.welcome();
    await flush();
    expect(flat.bake.baked({ ...tile, z: 0 })).toBe(false);
  });

  it('tells the GM how many baked tiles changed since', async () => {
    const { bake, host } = setup({ bake: 'b1', optimised: true });
    bake.welcome();
    await flush();
    expect(bake.changedSince()).toBe(0);
    (host.docs as DocStore).apply([{ op: 'update', coll: 'cave/tiles', id: 'floor', patch: { x: 50 } }]);
    expect(bake.changedSince()).toBe(1);
  });
});

describe('optimise and edit', () => {
  it('bakes, saves each file and switches the scene to the new bake', async () => {
    const { bake, sent, updates, run } = setup();
    const done = bake.optimise();
    await flush();
    expect(sent).toEqual([expect.objectContaining({ t: 'bakeBlock', scene: 'cave', path: 'manifest.json' })]);
    const ref = (sent[0] as { ref: string }).ref;
    bake.receive({ t: 'bakeSaved', ref });
    await done;
    expect(run).toHaveBeenCalled();
    const bakeId = (sent[0] as { bake: string }).bake;
    expect(updates).toHaveBeenCalledWith('optimise scene', [
      { ref: { coll: 'scenes', id: 'cave' }, patch: { optimised: true, bake: bakeId } },
    ]);
    expect(bake.running).toBeUndefined();
  });

  it('stops when a file can’t be saved, and says so', async () => {
    const { bake, sent, updates, errors } = setup();
    const done = bake.optimise();
    await flush();
    bake.receive({ t: 'error', message: 'Disk full', ref: (sent[0] as { ref: string }).ref });
    await done;
    expect(updates).not.toHaveBeenCalled();
    expect(errors).toEqual([expect.stringMatching(/Disk full/)]);
  });

  it('switches back to edit mode, keeping the bake for next time', () => {
    const { bake, updates } = setup({ bake: 'b1', optimised: true });
    bake.edit();
    expect(updates).toHaveBeenCalledWith('edit scene', [
      { ref: { coll: 'scenes', id: 'cave' }, patch: { optimised: null } },
    ]);
  });

  it('is the GM’s, on a 2D scene only', () => {
    expect(setup().bake.canOptimise).toBe(true);
    expect(setup({}, false).bake.canOptimise).toBe(false);
    expect(setup({ view: '3d' }).bake.canOptimise).toBe(false);
  });
});
