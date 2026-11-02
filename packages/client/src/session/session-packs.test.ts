import type { ServerMessage } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assetUrl } from '../assets.ts';
import { compendium } from '../content/compendium.ts';
import { gameContent } from '../content/content.ts';
import type { Session } from './session.ts';
import { closeSession, openSession, welcome, type FakeWebSocket } from './session.fixtures.ts';

let session: Session;
let ws: FakeWebSocket;

beforeEach(() => {
  ({ session, ws } = openSession());
});

afterEach(() => {
  ws.receive({ t: 'packContent', compendia: [] });
  closeSession(session);
});

const gmWelcome = (): ServerMessage => ({
  ...(welcome() as Extract<ServerMessage, { t: 'welcome' }>),
  you: { id: 'gm', name: 'GM', role: 'gm', color: '#fc0' },
  players: [{ id: 'gm', name: 'GM', role: 'gm', color: '#fc0' }],
  docs: {
    game: [{ type: 'game', id: 'test', rev: 3, name: 'Test', packs: ['forest'] }],
    scenes: [{ type: 'scene', id: 'main', rev: 1, name: 'Main', sort: 'a' }],
    'main/tiles': [],
  },
});

const sent = () => ws.sent.at(-1) as Record<string, unknown>;

const warlord = {
  id: 'goblin-warlord',
  name: 'Goblin Warlord',
  ac: 17,
  hp: 45,
  abilities: { str: 12, dex: 16, con: 12, int: 10, wis: 10, cha: 14 },
  cr: 3,
};
const forest = {
  id: 'forest',
  name: 'Forest',
  version: '1.0.0',
  system: null,
  compendia: [],
  media: 'media/',
  enabled: true,
};

describe('pack content in the client', () => {
  it('adds the monsters of the game’s packs to what sheets and the Compendium know', () => {
    ws.receive(gmWelcome());
    ws.receive({
      t: 'packContent',
      compendia: [{ pack: 'goblins', id: 'm', type: 'monster', path: 'm.json', docs: [warlord] }],
    });
    expect(gameContent('2014').monsters.get('goblin-warlord')?.ac).toBe(17);
    expect(compendium('monsters', '2014', 'warlord').map((e) => e.id)).toEqual(['goblin-warlord']);
  });

  it('adds the game’s homebrew classes, as they are now', () => {
    const base = gmWelcome() as Extract<ServerMessage, { t: 'welcome' }>;
    const seer = {
      type: 'homebrew',
      id: 'seer',
      rev: 1,
      kind: 'class',
      name: 'Seer',
      hitDie: 8,
      saves: [],
      features: [],
    };
    ws.receive({ ...base, docs: { ...base.docs, homebrew: [seer] } });
    ws.receive({ t: 'packContent', compendia: [] });
    expect(gameContent('2014').classes.get('seer')?.name).toBe('Seer');
  });

  it('plays by the game’s settings', () => {
    const base = gmWelcome() as Extract<ServerMessage, { t: 'welcome' }>;
    ws.receive({ ...base, world: { ...base.world, settings: { encumbrance: 'variant' } } });
    ws.receive({ t: 'packContent', compendia: [] });
    expect(gameContent('2014').settings?.encumbrance).toBe('variant');
  });

  it('shows pack files from where the server serves them', () => {
    expect(assetUrl('pack://forest/media/big oak.webp')).toBe('/packs/forest/media/big%20oak.webp');
  });
});

describe('the GM’s asset browser', () => {
  it('asks for the packs, the media and a compendium, and keeps the answers', () => {
    ws.receive(gmWelcome());
    session.packs.request();
    expect(sent()).toEqual({ t: 'packs' });
    ws.receive({ t: 'packs', packs: [forest], problems: ['broken/pack.json: id'] });
    expect(session.packs.list.map((p) => p.id)).toEqual(['forest']);
    expect(session.packs.problems).toEqual(['broken/pack.json: id']);
    session.packs.requestMedia();
    expect(sent()).toEqual({ t: 'media' });
    ws.receive({ t: 'media', entries: [{ src: '/assets/a.png', name: 'a', kind: 'image', tags: [] }] });
    expect(session.packs.media).toHaveLength(1);
    session.packs.openCompendium('forest', 'glades');
    expect(sent()).toEqual({ t: 'compendium', pack: 'forest', compendium: 'glades' });
    ws.receive({ t: 'compendium', pack: 'forest', compendium: 'glades', docs: [{ id: 'g' }] });
    expect(session.packs.compendiumDocs('forest', 'glades')).toEqual([{ id: 'g' }]);
    const before = ws.sent.length;
    session.packs.openCompendium('forest', 'glades');
    expect(ws.sent).toHaveLength(before);
  });

  it('turns packs on and off on game.json', () => {
    ws.receive(gmWelcome());
    session.packs.setPackEnabled('goblins', true);
    expect(sent()).toMatchObject({
      t: 'ops',
      ops: [{ op: 'update', coll: 'game', id: 'test', rev: 3, patch: { packs: ['forest', 'goblins'] } }],
    });
    session.packs.setPackEnabled('forest', false);
    expect(sent()).toMatchObject({ ops: [{ patch: { packs: ['goblins'] } }] });
  });

  it('lists the plugins and turns them on and off on game.json', () => {
    ws.receive(gmWelcome());
    session.packs.requestPlugins();
    expect(sent()).toEqual({ t: 'plugins' });
    const alert = {
      id: 'alert',
      name: 'Alert',
      version: '1.0.0',
      system: null,
      main: 'main.js',
      styles: [],
      languages: [],
    };
    ws.receive({ t: 'plugins', plugins: [{ ...alert, enabled: false }], problems: ['x/plugin.json: name'] });
    expect(session.packs.plugins.map((p) => p.id)).toEqual(['alert']);
    expect(session.packs.pluginProblems).toEqual(['x/plugin.json: name']);
    session.packs.setPluginEnabled('alert', true);
    expect(sent()).toMatchObject({ ops: [{ op: 'update', coll: 'game', patch: { plugins: ['alert'] } }] });
    expect(session.packs.plugins[0]?.enabled).toBe(true);
  });

  it('uploads a file', () => {
    ws.receive(gmWelcome());
    session.packs.upload('map.png', 'AAAA');
    expect(sent()).toEqual({ t: 'upload', name: 'map.png', data: 'AAAA' });
  });

  it('places a picture as a tile centred where it lands', () => {
    ws.receive(gmWelcome());
    session.drops.onMap({ kind: 'media', src: 'pack://forest/media/oak.webp', w: 300, h: 200 }, [500, 500]);
    expect(sent()).toMatchObject({
      t: 'ops',
      ops: [
        {
          op: 'create',
          coll: 'main/tiles',
          doc: { kind: 'image', src: 'pack://forest/media/oak.webp', x: 350, y: 400, w: 300, h: 200 },
        },
      ],
    });
  });

  it('imports a scene from a compendium as a new scene', () => {
    ws.receive(gmWelcome());
    session.packs.importScene({ id: 'cave', name: 'Goblin Cave', walls: [{ id: 'w', a: [0, 0], b: [100, 0] }] });
    expect(sent()).toMatchObject({
      t: 'ops',
      label: 'scene import',
      ops: [
        { op: 'create', coll: 'scenes', doc: { id: 'goblin-cave', name: 'Goblin Cave' } },
        { op: 'create', coll: 'goblin-cave/walls', doc: { id: 'w' } },
      ],
    });
    const before = ws.sent.length;
    session.packs.importScene({ id: 'broken' });
    expect(ws.sent).toHaveLength(before);
    expect(session.error?.message).toMatch(/can't be imported/);
  });

  it('adds an actor from a compendium to the Actors list under a free id', () => {
    ws.receive(gmWelcome());
    session.packs.importActor({ id: 'bandit-chief', name: 'Bandit Chief', monster: 'bandit' }, 'Bandits');
    expect(sent()).toMatchObject({
      t: 'saveActor',
      actor: { id: 'bandit-chief', name: 'Bandit Chief', folder: 'Bandits' },
    });
  });

  it('adds a journal entry, roll table or playlist from a compendium under a free id', () => {
    ws.receive(gmWelcome());
    ws.receive({
      t: 'docs',
      changes: [
        { coll: 'journals', id: 'lore', doc: { type: 'journal', id: 'lore', rev: 1, name: 'Lore', pages: [] } },
      ],
    });
    session.packs.importEntry('journal', {
      id: 'lore',
      name: 'Lore',
      pages: [{ id: 'p', name: 'Gods', text: 'Many' }],
    });
    expect(sent()).toMatchObject({
      t: 'ops',
      label: 'journal import',
      ops: [{ op: 'create', coll: 'journals', doc: { id: 'lore-2', type: 'journal', name: 'Lore' } }],
    });
    session.packs.importEntry('rolltable', { id: 'loot', name: 'Loot', results: [{ text: 'Gold' }] });
    expect(sent()).toMatchObject({ ops: [{ op: 'create', coll: 'tables', doc: { id: 'loot', type: 'rolltable' } }] });
    session.packs.importEntry('playlist', { id: 'inn', name: 'Inn', tracks: [] });
    expect(sent()).toMatchObject({ ops: [{ op: 'create', coll: 'playlists', doc: { id: 'inn', type: 'playlist' } }] });
    const before = ws.sent.length;
    session.packs.importEntry('rolltable', { id: 'empty', name: 'Empty', results: [] });
    expect(ws.sent).toHaveLength(before);
    expect(session.error?.message).toMatch(/can't be imported/);
  });

  it('places a tile prefab in the middle of the screen, on whole squares as a paste is', () => {
    ws.receive(gmWelcome());
    session.editor.viewRect = { x: 1000, y: 1000, w: 400, h: 400 };
    session.packs.importPrefab({
      id: 'cart',
      name: 'Cart',
      tiles: [
        { id: 'bed', kind: 'rect', x: 0, y: 0, w: 200, h: 100, color: '#8a5a2a' },
        { id: 'wheel', kind: 'rect', x: 0, y: 100, w: 100, h: 100, color: '#333333' },
      ],
    });
    expect(sent()).toMatchObject({
      t: 'ops',
      label: 'prefab',
      ops: [
        { op: 'create', coll: 'main/tiles', doc: { id: 'bed', x: 1200, y: 1200 } },
        { op: 'create', coll: 'main/tiles', doc: { id: 'wheel', x: 1200, y: 1300 } },
      ],
    });
  });
});
