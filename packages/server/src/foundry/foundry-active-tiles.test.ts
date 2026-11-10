import { describe, expect, it } from 'vitest';
import { foundryTrigger, SceneIndex, type TriggerLookups } from './foundry-active-tiles.ts';
import { madeFrom } from './foundry-origin.ts';

// A tavern scene: a lever tile (ours "tile-1"), a torch light and a gate
// door tagged with Tagger, and a chest tile Foundry calls T2.

const tagged = (tags: string[], id?: string) => ({ _id: id, flags: { tagger: { tags } } });
const index = new SceneIndex()
  .add('tiles', [
    madeFrom({ id: 'tile-1' }, { _id: 'T1', flags: { 'monks-active-tiles': { files: [{ name: 'lever-*.webp' }] } } }),
    madeFrom(
      { id: 'tile-2' },
      {
        _id: 'T2',
        x: 400,
        y: 600,
        width: 200,
        height: 100,
        flags: { 'monks-active-tiles': { files: [{ name: 'chest.webp' }] } },
      },
    ),
    madeFrom({ id: 'lift' }, tagged(['Lift'], 'T3')),
    madeFrom({ id: 'cell-1' }, tagged(['DoorLeft'], 'T4')),
    madeFrom(
      { id: 'drawbridge' },
      { _id: 'Br1dge', flags: { tagger: { tags: ['Bridge'] }, 'levels-3d-preview': { doorType: 1 } } },
    ),
  ])
  .add('lights', [madeFrom({ id: 'light-1' }, tagged(['torch-1'])), madeFrom({ id: 'light-2' }, tagged(['torch-2']))])
  .add('walls', [madeFrom({ id: 'wall-3' }, tagged(['villa-gate-1']))]);

/** The scene's floors by the elevation each starts at. */
const FLOORS = [
  [-10, 'cellar'],
  [0, 'ground'],
  [10, 'loft'],
] as const;

const lookups: TriggerLookups = {
  index,
  media: (p) => `/assets/foundry/${p}`,
  glob: (p) => (p === 'lever-*.webp' ? ['/assets/foundry/lever-up.webp', '/assets/foundry/lever-down.webp'] : []),
  scene: (id) => (id === 'S2' ? 'cellar' : undefined),
  entry: (id) => (id === 'J1' ? 'letter' : undefined),
  page: (id) => (id === 'P1' ? 'letter-1' : undefined),
  gridSize: 100,
  floorAt: (feet) => [...FLOORS].reverse().find(([bottom]) => feet >= bottom)?.[1] ?? 'cellar',
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

  it('takes whoever uses a ladder to the floor its elevation change names, before the teleport beside it', () => {
    const ladder = (value: string) =>
      foundryTrigger(
        monk({
          trigger: ['click'],
          actions: [
            { action: 'teleport', data: { location: { x: 2742, y: 2150, sceneId: null } } },
            { action: 'alter', data: { entity: { id: 'token' }, attribute: 'elevation', value } },
          ],
        }),
        'tile-1',
        lookups,
      ).trigger?.actions;
    expect(ladder('-10')).toEqual([
      { type: 'level', to: 'cellar' },
      { type: 'teleport', to: [2742, 2150] },
    ]);
    expect(ladder('= ({{entity.data.elevation}} || 0) == 0 ? 10 : 0')?.[0]).toEqual({
      type: 'stairs',
      between: ['loft', 'ground'],
    });
    expect(ladder('={{entity.data.elevation}} == 0 ? -10 : 0')?.[0]).toEqual({
      type: 'stairs',
      between: ['cellar', 'ground'],
    });
    // A step from where the creature is names no floor: it goes up or down that far.
    expect(ladder('+ 22.5')).toEqual([
      { type: 'elevation', by: 22.5 },
      { type: 'teleport', to: [2742, 2150] },
    ]);
  });

  it('raises a tagged lift and slides tagged cell doors when a lever is pulled', () => {
    const lever = foundryTrigger(
      monk({
        trigger: ['', 'click'],
        actions: [
          { action: 'elevation', data: { entity: { id: 'tagger:Lift' }, value: '- 22' } },
          { action: 'alter', data: { entity: { id: 'tagger:DoorLeft' }, attribute: 'y', value: '+ 130' } },
          { action: 'alter', data: { entity: { id: 'tagger:DoorLeft' }, attribute: 'x', value: '- 40' } },
        ],
      }),
      'tile-1',
      lookups,
    );
    expect(lever.trigger?.actions).toEqual([
      { type: 'elevation', target: { coll: 'tiles', id: 'lift' }, by: -22 },
      { type: 'shift', target: { coll: 'tiles', id: 'cell-1' }, by: [0, 130] },
      { type: 'shift', target: { coll: 'tiles', id: 'cell-1' }, by: [-40, 0] },
    ]);
    expect(lever.lost).toEqual([]);
  });

  it('sets the height of whoever walks onto a teleport pad, before it is taken away', () => {
    const pad = foundryTrigger(
      monk({
        trigger: ['', 'enter'],
        actions: [
          { action: 'teleport', data: { entity: { id: 'token' }, location: { x: 4581, y: 5629, sceneId: null } } },
          { action: 'elevation', data: { entity: { id: 'token' }, value: '62' } },
        ],
      }),
      'tile-1',
      { ...lookups, floorAt: undefined },
    );
    expect(pad.trigger?.actions).toEqual([
      { type: 'elevation', to: 62 },
      { type: 'teleport', to: [4581, 5629] },
    ]);
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

  it('works a 3D Canvas door model (a drawbridge, a trapdoor) through its door', () => {
    const lever = foundryTrigger(
      monk({
        trigger: ['', 'click'],
        actions: [
          {
            action: 'alter',
            data: { entity: { id: 'tagger:Bridge' }, attribute: 'flags.levels-3d-preview.doorState', value: '1' },
          },
          {
            action: 'alter',
            data: { entity: { id: 'tagger:Bridge' }, attribute: 'flags.levels-3d-preview.doorState', value: '0' },
          },
        ],
      }),
      'tile-1',
      lookups,
    );
    expect(lever.trigger?.actions).toEqual([
      { type: 'door', wall: 'door-br1dge', to: 'open' },
      { type: 'door', wall: 'door-br1dge', to: 'closed' },
    ]);
    expect(lever.lost).toEqual([]);
  });

  it('goes off when a creature moves within the tile or stops on it, as walking onto it does', () => {
    for (const when of [['', 'movement'], ['', 'stop'], 'stop']) {
      const raw = monk({ trigger: when, actions: [{ action: 'notification', data: { text: 'Thunder' } }] });
      expect(foundryTrigger(raw, 'tile-1', lookups).trigger?.on).toBe('enter');
    }
  });

  it("tells the GM what a GM's note dialog says, a note only the GM clicks", () => {
    const raw = monk({
      trigger: ['click', 'dblclick'],
      actions: [
        {
          action: 'dialog',
          data: { dialogtype: 'custom', for: 'gm', content: '<p>Use the button to open the door.</p>' },
        },
      ],
    });
    expect(foundryTrigger(raw, 'tile-1', lookups)).toEqual({
      trigger: {
        on: 'click',
        gmOnly: true,
        actions: [{ type: 'message', text: 'Use the button to open the door.', gmOnly: true }],
      },
      lost: [],
    });
  });

  it('asks a confirm dialog of whoever clicks, each answer running what its landing holds', () => {
    const raw = monk({
      trigger: 'click',
      actions: [
        {
          action: 'dialog',
          data: { dialogtype: 'confirm', title: 'The well', content: '<p>Climb down?</p>', yes: 'down', no: 'stay' },
        },
        { action: 'chatmessage', data: { text: 'never reached' } },
        { action: 'anchor', data: { tag: 'down', stop: true } },
        { action: 'teleport', data: { location: { x: 100, y: 200 } } },
        { action: 'anchor', data: { tag: 'stay', stop: true } },
        { action: 'chatmessage', data: { text: 'You stay up.' } },
      ],
    });
    expect(foundryTrigger(raw, 'tile-1', lookups)).toEqual({
      trigger: {
        on: 'click',
        actions: [
          {
            type: 'choice',
            title: 'The well',
            text: 'Climb down?',
            options: [
              { label: 'Yes', actions: [{ type: 'teleport', to: [100, 200] }] },
              { label: 'No', actions: [{ type: 'message', text: 'You stay up.' }] },
            ],
          },
        ],
      },
      lost: [],
    });
  });

  it("asks a custom dialog's buttons, following a goto to its landing", () => {
    const raw = monk({
      trigger: 'click',
      actions: [
        {
          action: 'dialog',
          data: {
            dialogtype: 'custom',
            content: 'Which lever?',
            buttons: [
              { name: 'Left', goto: 'left' },
              { name: 'Leave', goto: '' },
            ],
          },
        },
        { action: 'anchor', data: { tag: 'left', stop: true } },
        { action: 'goto', data: { tag: 'open' } },
        { action: 'anchor', data: { tag: 'open', stop: true } },
        { action: 'changedoor', data: { entity: { id: 'tagger:villa-gate-1' }, state: 'toggle' } },
      ],
    });
    expect(foundryTrigger(raw, 'tile-1', lookups).trigger?.actions).toEqual([
      {
        type: 'choice',
        text: 'Which lever?',
        options: [
          { label: 'Left', actions: [{ type: 'door', wall: 'wall-3', to: 'toggle' }] },
          { label: 'Leave', actions: [] },
        ],
      },
    ]);
  });

  it('opens a journal page, turns tagged tiles, shows a scene and moves the creature to a tile', () => {
    const raw = monk({
      trigger: 'click',
      actions: [
        { action: 'openjournal', data: { entity: { id: 'JournalEntry.J1' }, page: 'P1' } },
        { action: 'rotation', data: { entity: { id: 'tagger:Lift' }, rotation: '+ 90' } },
        { action: 'rotation', data: { entity: { id: 'tile' }, rotation: '45' } },
        { action: 'scene', data: { sceneid: { id: 'Scene.S2' }, activate: true } },
        { action: 'movetoken', data: { entity: { id: 'token' }, location: { id: 'Scene.S1.Tile.T2' } } },
        { action: 'movetoken', data: { entity: { id: 'token' }, location: { x: 30, y: 40 } } },
      ],
    });
    expect(foundryTrigger(raw, 'tile-1', lookups)).toEqual({
      trigger: {
        on: 'click',
        actions: [
          { type: 'journal', entry: 'letter', page: 'letter-1' },
          { type: 'rotate', target: { coll: 'tiles', id: 'lift' }, by: 90 },
          { type: 'rotate', target: { coll: 'tiles', id: 'tile-1' }, to: 45 },
          { type: 'view', scene: 'cellar', everyone: true },
          { type: 'teleport', to: [500, 650] },
          { type: 'teleport', to: [30, 40] },
        ],
      },
      lost: [],
    });
  });

  it("makes a tile with Monk's distance filter one only a creature close by can use", () => {
    const near = (data: Record<string, unknown>) =>
      foundryTrigger(
        monk({
          trigger: 'click',
          actions: [
            { action: 'distance', data },
            { action: 'chatmessage', data: { text: 'Hi' } },
          ],
        }),
        'tile-1',
        lookups,
      ).trigger?.near;
    expect(near({ entity: { id: 'token' }, measure: 'lte', distance: { value: 2 }, unit: 'sq' })).toBe(200);
    expect(near({ measure: 'lte', distance: 150, unit: 'px' })).toBe(150);
    expect(near({ measure: 'lt' })).toBe(0);
    expect(near({ measure: 'lte', distance: 2, continue: 'always' })).toBeUndefined();
  });
});
