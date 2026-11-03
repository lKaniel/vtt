import { describe, expect, it } from 'vitest';
import { foundryTrigger, SceneIndex, type TriggerLookups } from './foundry-active-tiles.ts';
import { madeFrom } from './foundry-origin.ts';

// A tavern scene: a lever tile (ours "tile-1"), a torch light and a gate
// door tagged with Tagger, and a chest tile Foundry calls T2.

const tagged = (tags: string[], id?: string) => ({ _id: id, flags: { tagger: { tags } } });
const index = new SceneIndex()
  .add('tiles', [
    madeFrom({ id: 'tile-1' }, { _id: 'T1', flags: { 'monks-active-tiles': { files: [{ name: 'lever-*.webp' }] } } }),
    madeFrom({ id: 'tile-2' }, { _id: 'T2', flags: { 'monks-active-tiles': { files: [{ name: 'chest.webp' }] } } }),
  ])
  .add('lights', [madeFrom({ id: 'light-1' }, tagged(['torch-1'])), madeFrom({ id: 'light-2' }, tagged(['torch-2']))])
  .add('walls', [madeFrom({ id: 'wall-3' }, tagged(['villa-gate-1']))]);

const lookups: TriggerLookups = {
  index,
  media: (p) => `/assets/foundry/${p}`,
  glob: (p) => (p === 'lever-*.webp' ? ['/assets/foundry/lever-up.webp', '/assets/foundry/lever-down.webp'] : []),
  scene: (id) => (id === 'S2' ? 'cellar' : undefined),
  imagesOf: (tile) => {
    const flags = index.rawOf({ coll: 'tiles', id: tile })?.flags as Record<string, { files: { name: string }[] }>;
    const files = flags['monks-active-tiles']!.files;
    return files.flatMap((f) => (f.name.includes('*') ? lookups.glob(f.name) : [lookups.media(f.name)!]));
  },
};

const monk = (flags: Record<string, unknown>) => ({ _id: 'T1', flags: { 'monks-active-tiles': flags } });

describe("Monk's Active Tiles as tile triggers", () => {
  it('swaps pictures, plays a sound, puts out tagged lights and opens a tagged gate on a click', () => {
    const raw = monk({
      trigger: ['', 'dblclick'],
      actions: [
        { action: 'tileimage', data: { entity: { id: 'tile' }, select: 'next' } },
        { action: 'playsound', data: { audiofile: 'sounds/lever.ogg', volume: 0.8 } },
        { action: 'activate', data: { entity: { id: 'tagger:torch-{#}' }, activate: 'deactivate' } },
        { action: 'changedoor', data: { entity: { id: 'tagger:villa-gate-{#}' }, state: 'OPEN' } },
        { action: 'showhide', data: { entity: { id: 'Scene.S1.Tile.T2' }, hidden: 'show' } },
        { action: 'runmacro', data: {} },
      ],
    });
    expect(foundryTrigger(raw, 'tile-1', lookups)).toEqual({
      trigger: {
        on: 'click',
        actions: [
          { type: 'image', images: ['/assets/foundry/lever-up.webp', '/assets/foundry/lever-down.webp'] },
          { type: 'sound', src: '/assets/foundry/sounds/lever.ogg', volume: 0.8 },
          { type: 'visibility', target: { coll: 'lights', id: 'light-1' }, to: 'hide' },
          { type: 'visibility', target: { coll: 'lights', id: 'light-2' }, to: 'hide' },
          { type: 'door', wall: 'wall-3', to: 'open' },
          { type: 'visibility', target: { coll: 'tiles', id: 'tile-2' }, to: 'show' },
        ],
      },
      lost: ['runmacro'],
    });
  });

  it('teleports whoever walks on, to another scene, and says so to the GM', () => {
    const raw = monk({
      trigger: 'enter',
      controlled: 'all',
      active: false,
      actions: [
        { action: 'notification', data: { text: '<p>The floor <b>gives</b>!</p>', showto: 'gm' } },
        { action: 'delay', data: { delay: '2.5' } },
        { action: 'teleport', data: { location: { x: 2256.4, y: 1348, sceneId: 'S2' } } },
      ],
    });
    expect(foundryTrigger(raw, 'tile-1', lookups)).toEqual({
      trigger: {
        on: 'enter',
        disabled: true,
        actions: [
          { type: 'message', text: 'The floor gives !', gmOnly: true },
          { type: 'teleport', to: [2256, 1348], scene: 'cellar' },
        ],
      },
      lost: [],
    });
  });

  it('follows a dialog\'s jumps down the "next" branch, for the GM\'s right-click', () => {
    const raw = monk({
      trigger: ['', 'dblrightclick'],
      actions: [
        { action: 'anchor', data: { tag: 'start' } },
        { action: 'dialog', data: {} },
        { action: 'anchor', data: { tag: 'previous' } },
        { action: 'tileimage', data: { entity: { id: 'tile' }, select: 'previous' } },
        { action: 'goto', data: { tag: 'start' } },
        { action: 'anchor', data: { tag: 'next' } },
        { action: 'tileimage', data: { entity: { id: 'tile' }, select: 'next' } },
        { action: 'goto', data: { tag: 'start' } },
      ],
    });
    const { trigger, lost } = foundryTrigger(raw, 'tile-2', lookups);
    expect(trigger).toEqual({
      on: 'click',
      gmOnly: true,
      actions: [{ type: 'image', images: ['/assets/foundry/chest.webp'] }],
    });
    expect(lost).toEqual(['dialog']);
  });

  it('leaves a tile without a trigger when nothing it does has a match', () => {
    const raw = monk({ trigger: 'click', actions: [{ action: 'runmacro' }, { action: 'alter' }] });
    expect(foundryTrigger(raw, 'tile-1', lookups)).toEqual({ lost: ['runmacro', 'alter'] });
  });
});
