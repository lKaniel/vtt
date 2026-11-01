import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeTwoScenes } from './test/fixtures.ts';
import { GameStore } from './game-store.ts';

let dir: string;
let store: GameStore;
let game: Game;

beforeEach(async () => {
  dir = await makeTwoScenes();
  store = new GameStore(dir);
  await store.load();
  game = new Game(store, { rng: () => 0.5 });
});

afterEach(async () => {
  await store.flush();
});

function seat(playerId: string): FakeSocket {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer(playerId)!);
  return ws;
}

const readJson = async (rel: string): Promise<unknown> => JSON.parse(await readFile(join(dir, rel), 'utf8'));
const exists = (rel: string) =>
  access(join(dir, rel)).then(
    () => true,
    () => false,
  );
const welcomes = (ws: FakeSocket) => ws.take('welcome');
const tokenIds = (ws: FakeSocket) =>
  ws
    .take('welcome')
    .at(-1)!
    .tokens.map((t) => t.id)
    .sort(byName);
const byName = (a: string, b: string) => a.localeCompare(b);
const errors = (ws: FakeSocket) => ws.take('error').map((e) => e.message);

describe('a game with several scenes', () => {
  it('keeps every scene live, and the rules read the one they are told to', () => {
    expect([...store.tokens.keys()].sort(byName)).toEqual(['goblin', 'hero']);
    expect(store.inScene('cellar', () => [...store.tokens.keys()].sort(byName))).toEqual(['rat', 'scout']);
    expect(store.inScene('cellar', () => store.world.darkness)).toBe(0);
    expect(store.world.darkness).toBe(1);
  });

  it('welcomes everyone on the scene the game is on', () => {
    const ana = seat('ana');
    const welcome = ana.take('welcome')[0]!;
    expect(welcome).toMatchObject({ scene: 'main', active: 'main' });
    expect(welcome.tokens.map((t) => t.id)).toEqual(['hero']);
  });

  it('lets the GM look at another scene while the players stay put', () => {
    const gm = seat('gm');
    const ana = seat('ana');
    welcomes(ana);
    welcomes(gm);
    gm.receive({ t: 'viewScene', scene: 'cellar' });
    const welcome = gm.take('welcome').at(-1)!;
    expect(welcome).toMatchObject({ scene: 'cellar', active: 'main', world: { darkness: 0 } });
    expect(welcome.tokens.map((t) => t.id).sort(byName)).toEqual(['rat', 'scout']);
    expect(welcomes(ana)).toEqual([]);
    gm.receive({ t: 'view', chunks: ['0_0'] });
    expect(gm.take('chunk')[0]!.chunk.walls.map((w) => w.id)).toEqual(['cw']);
  });

  it('edits the scene the GM is looking at', async () => {
    const gm = seat('gm');
    gm.receive({ t: 'viewScene', scene: 'cellar' });
    gm.receive({ t: 'darkness', darkness: 0.5 });
    gm.receive({ t: 'editToken', token: 'rat', patch: { name: 'Big rat' } });
    expect(errors(gm)).toEqual([]);
    await store.flush();
    expect(await readJson('scenes/cellar/scene.json')).toMatchObject({ darkness: 0.5 });
    expect(await readJson('scenes/main/scene.json')).toMatchObject({ darkness: 1 });
    expect(store.inScene('cellar', () => store.tokens.get('rat')!.name)).toBe('Big rat');
    expect(store.tokens.has('rat')).toBe(false);
  });

  it('moves everyone to the scene the GM activates, and saves it', async () => {
    const gm = seat('gm');
    const ana = seat('ana');
    welcomes(ana);
    gm.receive({ t: 'activateScene', scene: 'cellar' });
    expect(ana.take('welcome').at(-1)).toMatchObject({ scene: 'cellar', active: 'cellar' });
    expect([...store.tokens.keys()].sort(byName)).toEqual(['rat', 'scout']);
    await store.flush();
    expect(await readJson('game.json')).toMatchObject({ scene: 'cellar' });
  });

  it('sends one player to another scene and back', () => {
    const gm = seat('gm');
    const ana = seat('ana');
    const bo = seat('bo');
    welcomes(ana);
    welcomes(bo);
    gm.receive({ t: 'sendPlayer', player: 'ana', scene: 'cellar' });
    expect(tokenIds(ana)).toEqual(['rat', 'scout']);
    expect(welcomes(bo)).toEqual([]);
    gm.receive({ t: 'sendPlayer', player: 'ana' });
    expect(ana.take('welcome').at(-1)).toMatchObject({ scene: 'main' });
  });

  it('plays on a player’s own scene: they walk there and the file is saved', async () => {
    const gm = seat('gm');
    gm.receive({ t: 'sendPlayer', player: 'ana', scene: 'cellar' });
    const ana = seat('ana');
    welcomes(ana);
    ana.receive({ t: 'move', token: 'scout', to: [350, 150] });
    expect(errors(ana)).toEqual([]);
    expect(store.inScene('cellar', () => store.tokens.get('scout'))).toMatchObject({ x: 350 });
    await store.flush();
    expect(await readJson('scenes/cellar/tokens.json')).toContainEqual(
      expect.objectContaining({ id: 'scout', x: 350 }),
    );
  });

  it('keeps scene moves for the GM', () => {
    const ana = seat('ana');
    ana.receive({ t: 'viewScene', scene: 'cellar' });
    ana.receive({ t: 'activateScene', scene: 'cellar' });
    ana.receive({ t: 'sendPlayer', player: 'bo', scene: 'cellar' });
    expect(errors(ana)).toEqual(Array(3).fill('Only the GM can do that'));
  });

  it('refuses a scene that does not exist', () => {
    const gm = seat('gm');
    gm.receive({ t: 'viewScene', scene: 'nowhere' });
    expect(errors(gm)).toEqual(['There is no scene "nowhere"']);
  });
});

describe('making and removing scenes', () => {
  const sceneDoc = { type: 'scene', id: 'attic', rev: 0, name: 'Attic', gridSize: 50, chunkSize: 1000 };

  it('creates a scene with an op, as a folder with its scene.json', async () => {
    const gm = seat('gm');
    gm.receive({ t: 'ops', txn: 't1', ops: [{ op: 'create', coll: 'scenes', doc: sceneDoc }] });
    expect(gm.take('reject')).toEqual([]);
    gm.receive({ t: 'viewScene', scene: 'attic' });
    expect(gm.take('welcome').at(-1)).toMatchObject({ scene: 'attic', world: { gridSize: 50 } });
    await store.flush();
    expect(await readJson('scenes/attic/scene.json')).toMatchObject({ name: 'Attic', gridSize: 50 });
  });

  it('deletes a scene with everything on it, sends whoever was there home, and undoes it', async () => {
    const gm = seat('gm');
    gm.receive({ t: 'sendPlayer', player: 'ana', scene: 'cellar' });
    const ana = seat('ana');
    welcomes(ana);
    gm.receive({ t: 'ops', txn: 't1', ops: [{ op: 'delete', coll: 'scenes', id: 'cellar' }] });
    expect(gm.take('reject')).toEqual([]);
    expect(ana.take('welcome').at(-1)).toMatchObject({ scene: 'main' });
    await store.flush();
    expect(await exists('scenes/cellar/scene.json')).toBe(false);
    expect(await exists('scenes/cellar/tokens.json')).toBe(false);
    gm.receive({ t: 'undo' });
    expect(store.inScene('cellar', () => [...store.tokens.keys()].sort(byName))).toEqual(['rat', 'scout']);
    await store.flush();
    expect(await exists('scenes/cellar/tokens.json')).toBe(true);
  });

  it('will not delete the scene the game is on', () => {
    const gm = seat('gm');
    gm.receive({ t: 'ops', txn: 't1', ops: [{ op: 'delete', coll: 'scenes', id: 'main' }] });
    expect(gm.take('reject')[0]!.reason).toBe('Activate another scene before deleting this one');
  });
});
