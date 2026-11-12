import type { ClientMessage, TokenView } from '@vtt/system-dnd5e';
import { describe, expect, it } from 'vitest';
import type { Draft } from '../editor/shape-tools.ts';
import { Drops, type DropHost } from './session-drops.ts';

const hero = {
  id: 'hero',
  name: 'Hero',
  x: 150,
  y: 150,
  size: 1,
  inventory: [{ item: 'dagger', qty: 1 }],
} as TokenView;
const ogre = { id: 'ogre', name: 'Ogre', x: 550, y: 550, size: 1 } as TokenView;

const inn = {
  id: 'inn',
  name: 'Inn',
  mode: 'sequence',
  tracks: [
    { id: 'lute', name: 'Lute', src: 'lute.ogg' },
    { id: 'harp', name: 'Harp', src: 'harp.ogg', volume: 0.4 },
  ],
};

function drops(playlist: object = inn) {
  const sent: ClientMessage[] = [];
  const errors: string[] = [];
  const drafts: Draft[] = [];
  const asked: unknown[] = [];
  const placed: unknown[] = [];
  const host = {
    packs: { placePrefab: (...a: unknown[]) => placed.push(a) },
    world: { gridSize: 100 },
    tokens: new Map([
      ['hero', hero],
      ['ogre', ogre],
    ]),
    actors: new Map(),
    sheets: { askLevelUp: (...a: unknown[]) => asked.push(a) },
    docs: { get: (coll: string, id: string) => (coll === 'playlists' && id === 'inn' ? playlist : undefined) },
    draw: { create: (d: Draft) => drafts.push(d) },
    requests: { saveActor: () => undefined },
    send: (m: ClientMessage) => sent.push(m),
    showError: (e: string) => errors.push(e),
  } as unknown as DropHost;
  const d = new Drops(host, { changed: () => undefined, placeMedia: () => undefined });
  return { drops: d, sent, errors, drafts, asked, placed };
}

describe('Drops', () => {
  it('places a prefab from the Baileywiki library where it was let go', () => {
    const { drops: d, placed, sent } = drops();
    d.onMap({ kind: 'prefab', pack: 'bw', compendium: 'prefabs', id: 'crate' }, [300, 400]);
    expect(placed).toEqual([[{ pack: 'bw', compendium: 'prefabs', id: 'crate' }, [300, 400]]]);
    expect(sent).toEqual([]);
  });

  it('drops a carried stack on the open ground as a pile, looking the carrier up among the live tokens', () => {
    const { drops: d, sent, errors } = drops();
    d.onMap({ kind: 'carried', from: 'hero', item: 'dagger' }, [900, 900]);
    expect(errors).toEqual([]);
    expect(sent).toEqual([{ t: 'trade', from: 'hero', item: 0 }]);
  });

  it('hands a carried stack to the creature it lands on', () => {
    const { drops: d, sent } = drops();
    d.onMap({ kind: 'carried', from: 'hero', item: 'dagger' }, [560, 540]);
    expect(sent).toEqual([{ t: 'give', from: 'hero', to: 'ogre', item: 'dagger' }]);
  });

  it('pins a roll table to the map as a note that rolls it', () => {
    const { drops: d, drafts } = drops();
    d.onMap({ kind: 'table', id: 'loot', name: 'Loot' }, [300, 400]);
    expect(drafts).toEqual([{ mode: 'notes', data: { x: 300, y: 400, table: 'loot', label: 'Loot', icon: '🎲' } }]);
  });

  it('makes a playlist a sound on the map: its first track, or every track of one played together', () => {
    const one = drops();
    one.drops.onMap({ kind: 'playlist', id: 'inn' }, [300, 400]);
    expect(one.drafts).toEqual([
      { mode: 'sounds', data: { x: 300, y: 400, src: 'lute.ogg', radius: 30, name: 'Inn: Lute' } },
    ]);
    const all = drops({ ...inn, mode: 'together' });
    all.drops.onMap({ kind: 'playlist', id: 'inn' }, [300, 400]);
    expect(all.drafts.map((x) => x.data)).toEqual([
      { x: 300, y: 400, src: 'lute.ogg', radius: 30, name: 'Inn: Lute' },
      { x: 300, y: 400, src: 'harp.ogg', radius: 30, name: 'Inn: Harp', volume: 0.4 },
    ]);
    const none = drops({ ...inn, tracks: [] });
    none.drops.onMap({ kind: 'playlist', id: 'inn' }, [300, 400]);
    expect(none.errors).toEqual(['Inn has no tracks']);
  });

  it('opens the level up for a class dropped on a sheet, and sends a species to the server', () => {
    const { drops: d, sent, asked } = drops();
    d.onSheet({ kind: 'class', id: 'wizard', rules: '2014' }, undefined, { kind: 'token', id: 'hero' });
    expect(asked).toEqual([[{ kind: 'token', id: 'hero' }, 'wizard']]);
    d.onSheet({ kind: 'species', id: 'elf', rules: '2014' }, undefined, { kind: 'token', id: 'hero' });
    expect(sent).toEqual([
      { t: 'drop', what: { kind: 'species', id: 'elf', rules: '2014' }, onto: { kind: 'token', id: 'hero' } },
    ]);
  });
});
