import { mediaEntry, type MediaEntry } from '@vtt/core';
import { describe, expect, it } from 'vitest';
import { browse, folderOf, within } from './asset-folders.ts';

const pack = (path: string) => mediaEntry(`pack://bw/${path}`, path, 'bw')!;
const own = (path: string) => mediaEntry(`/assets/${path}`, path)!;

const media: MediaEntry[] = [
  pack('maps/props/barrel.webp'),
  pack('maps/props/crate.webp'),
  pack('maps/trees/oak.webp'),
  pack('models/cart.glb'),
  pack('models/zz-textures/wood.webp'),
  own('foundry/modules/baileywiki-3d/models/tent.glb'),
  own('foundry/modules/baileywiki-3d/models/chair.glb'),
  own('tokens/bram.svg'),
];

describe('folderOf', () => {
  it('starts with the pack (or "" for the game) and goes down its folders', () => {
    expect(folderOf(media[0]!)).toEqual(['bw', 'maps', 'props']);
    expect(folderOf(media[7]!)).toEqual(['', 'tokens']);
  });
});

describe('browse', () => {
  it('lists the game and the packs at the top', () => {
    const top = browse(media, []);
    expect(top.at).toEqual([]);
    expect(top.folders).toEqual([
      { name: '', path: [''], count: 3 },
      { name: 'bw', path: ['bw'], count: 4 },
    ]);
    expect(top.files).toEqual([]);
  });

  it('shows a folder’s folders, with how much is in each, and its own files', () => {
    const maps = browse(media, ['bw', 'maps']);
    expect(maps.folders.map((f) => [f.name, f.count])).toEqual([
      ['props', 2],
      ['trees', 1],
    ]);
    expect(browse(media, ['bw', 'models']).files.map((m) => m.name)).toEqual(['cart']);
  });

  it('leaves out the folders models keep their textures in', () => {
    expect(browse(media, ['bw', 'models']).folders).toEqual([]);
    expect(browse(media, ['bw']).folders.find((f) => f.name === 'models')?.count).toBe(1);
  });

  it('goes straight down a folder that holds only one folder', () => {
    const own = browse(media, ['']);
    expect(own.folders.map((f) => f.name)).toEqual(['foundry', 'tokens']);
    const deep = browse(media, ['', 'foundry']);
    expect(deep.at).toEqual(['', 'foundry', 'modules', 'baileywiki-3d', 'models']);
    expect(deep.files.map((m) => m.name)).toEqual(['chair', 'tent']);
  });
});

describe('within', () => {
  it('is everything under a folder, however deep, without model textures', () => {
    expect(within(media, ['bw']).map((m) => m.name)).toEqual(['barrel', 'crate', 'oak', 'cart']);
    expect(within(media, [])).toHaveLength(7);
  });
});
