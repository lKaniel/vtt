import type { Doc } from '@vtt/core';
import { describe, expect, it } from 'vitest';
import { laid } from './laid-docs.ts';

const doc = (id: string, x: number): Doc => ({ id, type: 'note', rev: 1, x, y: 0 });
const colls: Record<string, Doc[]> = {
  'city/notes': [doc('gate', 5)],
  'market/notes': [doc('inn', 10)],
  'docks/notes': [doc('pier', 20)],
};
const docs = { all: (coll: string) => colls[coll] ?? [] };

describe('what is laid on the scene you are on', () => {
  it('is the scene’s own and its parts’, each where the part lies', () => {
    const s = { docs, scene: 'city', world: { parts: [{ scene: 'market', x: 1000, y: 0 }] } };
    expect(laid(s, 'notes').map((d) => [d.id, d.x])).toEqual([
      ['gate', 5],
      ['market--inn', 1010],
    ]);
  });

  it('puts a part’s things on the scene’s floors', () => {
    const inn = { ...doc('inn', 0), level: 'f1' };
    const on = { docs: { all: (coll: string) => (coll === 'market/notes' ? [inn] : []) }, scene: 'city' };
    const world = { parts: [{ scene: 'market', x: 0, y: 0 }], partFloors: { market: { f1: 'upper' } } };
    expect(laid({ ...on, world }, 'notes').map((d) => d.level)).toEqual(['upper']);
  });

  it('is the scene’s own on a scene with no parts', () => {
    expect(laid({ docs, scene: 'docks', world: {} }, 'notes').map((d) => d.id)).toEqual(['pier']);
  });
});
