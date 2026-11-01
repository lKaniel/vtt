import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { GameStore } from './game-store.ts';
import { PackStore } from './pack-store.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';

let dir: string;
let packDir: string;
let store: GameStore;
let game: Game;

const warlord = {
  id: 'goblin-warlord',
  name: 'Goblin Warlord',
  ac: 17,
  hp: 45,
  abilities: { str: 12, dex: 16, con: 12, int: 10, wis: 10, cha: 14 },
  cr: 3,
};

async function put(root: string, path: string, data: unknown): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), typeof data === 'string' ? data : JSON.stringify(data));
}

async function start(packs?: string[]): Promise<void> {
  if (packs) {
    const file = JSON.parse(await readFile(join(dir, 'game.json'), 'utf8')) as object;
    await put(dir, 'game.json', { ...file, packs });
  }
  const installed = new PackStore(packDir);
  await installed.load();
  store = new GameStore(dir, undefined, installed);
  await store.load();
  game = new Game(store);
}

beforeEach(async () => {
  dir = await makeWorld();
  packDir = await mkdtemp(join(tmpdir(), 'vtt-packs-'));
  await put(packDir, 'goblins/pack.json', {
    id: 'goblins',
    name: 'Goblins',
    system: 'dnd5e',
    compendia: [
      { id: 'monsters', type: 'monster', path: 'monsters.json' },
      { id: 'lairs', type: 'scene', path: 'lairs.json' },
    ],
  });
  await put(packDir, 'goblins/monsters.json', [warlord]);
  await put(packDir, 'goblins/lairs.json', [{ id: 'cave', name: 'Cave' }]);
  await put(packDir, 'goblins/media/Tokens/warlord.webp', 'x');
  await put(dir, 'assets/maps/road.png', 'x');
});

afterEach(async () => {
  await store.flush();
});

function seat(playerId: string): FakeSocket {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer(playerId)!);
  return ws;
}

/** Waits for the async pack replies. */
const settle = () => new Promise((r) => setTimeout(r, 30));

describe('a game with packs turned on', () => {
  it('sends everyone the rules content of its packs when they join', async () => {
    await start(['goblins']);
    const ana = seat('ana');
    const [content] = ana.take('packContent');
    expect(content!.compendia.map((c) => `${c.pack}/${c.id}`)).toEqual(['goblins/monsters']);
  });

  it('places a pack monster like an SRD one', async () => {
    await start(['goblins']);
    const gm = seat('gm');
    gm.receive({ t: 'spawn', from: { kind: 'monster', id: 'goblin-warlord', rules: '2014' }, at: [750, 450] });
    const token = [...store.tokens.values()].find((t) => t.monster === 'goblin-warlord');
    expect(token).toMatchObject({ name: 'Goblin Warlord' });
    expect(game.table.sheetOf(token!)?.ac).toBe(17);
  });

  it('has no pack monsters when the pack is off', async () => {
    await start();
    const gm = seat('gm');
    gm.take('welcome');
    gm.receive({ t: 'spawn', from: { kind: 'monster', id: 'goblin-warlord', rules: '2014' }, at: [750, 450] });
    expect(gm.take('error')[0]!.message).toMatch(/goblin-warlord/);
  });

  it('sends the new content when the GM turns a pack on', async () => {
    await start();
    const gm = seat('gm');
    const ana = seat('ana');
    ana.take('packContent');
    gm.receive({ t: 'ops', txn: 't1', ops: [{ op: 'update', coll: 'game', id: 'test', patch: { packs: ['goblins'] } }] });
    expect(store.campaign.packs).toEqual(['goblins']);
    expect(ana.take('packContent').at(-1)!.compendia).toHaveLength(1);
  });
});

describe('the GM browsing packs', () => {
  it('lists the packs the game may use', async () => {
    await start(['goblins']);
    const gm = seat('gm');
    gm.receive({ t: 'packs' });
    await settle();
    const [list] = gm.take('packs');
    expect(list!.packs.map((p) => [p.id, p.enabled])).toEqual([
      ['dnd5e-srd-2014', true],
      ['dnd5e-srd-2024', true],
      ['goblins', true],
    ]);
  });

  it('gets the media of the game and of its packs', async () => {
    await start(['goblins']);
    const gm = seat('gm');
    gm.receive({ t: 'media' });
    await settle();
    const [media] = gm.take('media');
    expect(media!.entries.map((m) => m.src)).toEqual(['/assets/maps/road.png', 'pack://goblins/media/Tokens/warlord.webp']);
  });

  it('gets a compendium’s documents, its own system’s too', async () => {
    await start(['goblins']);
    const gm = seat('gm');
    gm.receive({ t: 'compendium', pack: 'goblins', compendium: 'lairs' });
    gm.receive({ t: 'compendium', pack: 'dnd5e-srd-2014', compendium: 'monsters' });
    gm.receive({ t: 'compendium', pack: 'goblins', compendium: 'nope' });
    await settle();
    const errors = gm.sent.filter((m) => m.t === 'error');
    const replies = gm.take('compendium');
    expect(replies[0]!.docs).toEqual([{ id: 'cave', name: 'Cave' }]);
    expect(replies[1]!.docs.length).toBeGreaterThan(300);
    expect(errors).toEqual([{ t: 'error', message: 'No compendium "nope" in pack "goblins"' }]);
  });

  it('keeps all of it from the players', async () => {
    await start(['goblins']);
    const ana = seat('ana');
    ana.receive({ t: 'packs' });
    ana.receive({ t: 'media' });
    await settle();
    expect(ana.take('error')).toHaveLength(2);
  });
});

describe('uploads', () => {
  const png = Buffer.from('fake png').toString('base64');

  it('saves a picture the GM uploads in the game’s assets and lists it', async () => {
    await start();
    const gm = seat('gm');
    gm.receive({ t: 'upload', name: 'Old Map (v2).PNG', data: png });
    gm.receive({ t: 'upload', name: 'Old Map (v2).PNG', data: png });
    await settle();
    expect(await readFile(join(dir, 'assets/uploads/old-map-v2.png'), 'utf8')).toBe('fake png');
    const media = gm.take('media').at(-1)!;
    expect(media.entries.map((m) => m.src)).toContain('/assets/uploads/old-map-v2-2.png');
  });

  it('refuses files that are not media, and players', async () => {
    await start();
    const gm = seat('gm');
    gm.receive({ t: 'upload', name: 'evil.html', data: png });
    const ana = seat('ana');
    ana.receive({ t: 'upload', name: 'map.png', data: png });
    await settle();
    expect(gm.take('error')[0]!.message).toMatch(/picture, sound or video/);
    expect(ana.take('error')).toHaveLength(1);
  });
});
