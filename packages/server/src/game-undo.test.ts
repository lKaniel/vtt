import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';
import { GameStore } from './game-store.ts';

let dir: string;
let store: GameStore;
let game: Game;

beforeEach(async () => {
  dir = await makeWorld();
  // Ana is trusted, so she has edits of her own to undo.
  const seats = JSON.parse(await readFile(join(dir, 'game.json'), 'utf8')) as { players: { role: string }[] };
  seats.players[1]!.role = 'trusted';
  await writeFile(join(dir, 'game.json'), JSON.stringify(seats));
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
  ws.take('welcome');
  return ws;
}

const errors = (ws: FakeSocket) => ws.take('error').map((e) => e.message);
const lastHistory = (ws: FakeSocket) => ws.sent.filter((m) => m.t === 'history').at(-1);

describe('undo and redo of edits', () => {
  it('puts a token edit back and does it again', () => {
    const gm = seat('gm');
    gm.receive({ t: 'editToken', token: 'goblin', patch: { name: 'Snik', hp: 3 } });
    expect(lastHistory(gm)).toEqual({ t: 'history', undo: 'token edit' });
    gm.receive({ t: 'undo' });
    expect(store.tokens.get('goblin')).toMatchObject({ name: 'Goblin' });
    expect(store.tokens.get('goblin')!.hp).toBeUndefined();
    expect(lastHistory(gm)).toEqual({ t: 'history', redo: 'token edit' });
    gm.receive({ t: 'redo' });
    expect(store.tokens.get('goblin')).toMatchObject({ name: 'Snik', hp: 3 });
    expect(errors(gm)).toEqual([]);
  });

  it('undoes one step per message, however many documents it touched', () => {
    const gm = seat('gm');
    gm.receive({ t: 'spawn', from: { kind: 'monster', id: 'goblin', rules: '2014' }, at: [720, 480] });
    // A new actor for the monster and its token, made in one step.
    expect([store.actors.size, store.tokens.size]).toEqual([3, 3]);
    gm.receive({ t: 'undo' });
    expect([store.actors.size, store.tokens.size]).toEqual([2, 2]);
  });

  it('undoes several edits of the same document one by one, and redoes them', () => {
    const gm = seat('gm');
    for (const darkness of [0.2, 0.4, 0.6]) gm.receive({ t: 'darkness', darkness });
    gm.receive({ t: 'undo' });
    gm.receive({ t: 'undo' });
    expect(store.world.darkness).toBeCloseTo(0.2);
    gm.receive({ t: 'redo' });
    gm.receive({ t: 'redo' });
    expect(store.world.darkness).toBeCloseTo(0.6);
    gm.receive({ t: 'undo' });
    gm.receive({ t: 'undo' });
    gm.receive({ t: 'undo' });
    expect(store.world.darkness).toBe(1);
    expect(errors(gm)).toEqual([]);
  });

  it('keeps a history for each user', () => {
    const gm = seat('gm');
    const ana = seat('ana');
    ana.receive({ t: 'editToken', token: 'hero', patch: { name: 'Ana the Bold' } });
    gm.receive({ t: 'editToken', token: 'goblin', patch: { name: 'Snik' } });
    ana.receive({ t: 'undo' });
    expect(store.tokens.get('hero')!.name).toBe('Hero');
    expect(store.tokens.get('goblin')!.name).toBe('Snik');
  });

  it("refuses a player's undo once they no longer control the creature", () => {
    const gm = seat('gm');
    const ana = seat('ana');
    ana.receive({ t: 'hotbar', token: 'hero', slots: ['longsword'] });
    gm.receive({ t: 'ops', txn: 't', ops: [{ op: 'update', coll: 'actors', id: 'hero', patch: { ownership: null } }] });
    ana.receive({ t: 'undo' });
    expect(errors(ana)).toEqual(["You can't undo the action bar change any more"]);
    expect(store.tokens.get('hero')!.hotbar).toEqual(['longsword']);
  });

  it('refuses to undo what someone has changed since, names them and moves on', () => {
    const gm = seat('gm');
    const ana = seat('ana');
    gm.receive({ t: 'darkness', darkness: 0.2 });
    gm.receive({ t: 'editToken', token: 'hero', patch: { hp: 5 } });
    ana.receive({ t: 'editToken', token: 'hero', patch: { hp: 9 } });
    gm.receive({ t: 'undo' });
    expect(errors(gm)).toEqual(["Can't undo the token edit: Ana has changed Hero since"]);
    expect(store.tokens.get('hero')!.hp).toBe(9);
    gm.receive({ t: 'undo' });
    expect(store.world.darkness).toBe(1);
  });

  it('names a hand edit of the files', async () => {
    const gm = seat('gm');
    store.watch();
    gm.receive({ t: 'darkness', darkness: 0.2 });
    await store.flush();
    await writeFile(join(dir, 'scenes/main/scene.json'), JSON.stringify({ darkness: 0.7 }));
    await waitFor(() => Math.abs(store.world.darkness - 0.7) < 1e-9);
    store.close();
    gm.receive({ t: 'undo' });
    expect(errors(gm)).toEqual(["Can't undo the time of day: someone editing the files has changed main since"]);
  });

  it('starts redo over after a new edit', () => {
    const gm = seat('gm');
    gm.receive({ t: 'darkness', darkness: 0.2 });
    gm.receive({ t: 'undo' });
    gm.receive({ t: 'darkness', darkness: 0.4 });
    gm.receive({ t: 'redo' });
    expect(errors(gm)).toEqual(['Nothing to redo']);
  });

  it('says when there is nothing to undo', () => {
    const gm = seat('gm');
    gm.receive({ t: 'undo' });
    expect(errors(gm)).toEqual(['Nothing to undo']);
  });

  it('tells you what was undone', () => {
    const gm = seat('gm');
    gm.receive({ t: 'darkness', darkness: 0.2 });
    gm.receive({ t: 'undo' });
    expect(gm.take('undone')).toEqual([{ t: 'undone', label: 'time of day', redo: false }]);
  });
});

describe('undo of game actions', () => {
  it("is the GM's: players can't undo what they did in the game", () => {
    const ana = seat('ana');
    ana.receive({ t: 'move', token: 'hero', to: [50, 50] });
    ana.receive({ t: 'undo' });
    expect(errors(ana)).toEqual(['Nothing to undo']);
  });

  it('lets the GM undo the latest action, without rolling again', () => {
    const gm = seat('gm');
    const ana = seat('ana');
    ana.receive({ t: 'move', token: 'hero', to: [50, 50] });
    expect(lastHistory(gm)).toMatchObject({ undo: 'move' });
    gm.receive({ t: 'undo' });
    expect(store.tokens.get('hero')).toMatchObject({ x: 150, y: 150 });
    gm.receive({ t: 'redo' });
    expect(store.tokens.get('hero')).toMatchObject({ x: 50, y: 50 });
  });

  it("undoes the GM's own edit or the latest action, whichever came last", () => {
    const gm = seat('gm');
    const ana = seat('ana');
    gm.receive({ t: 'darkness', darkness: 0.2 });
    ana.receive({ t: 'move', token: 'hero', to: [50, 50] });
    gm.receive({ t: 'undo' });
    expect(store.tokens.get('hero')).toMatchObject({ x: 150, y: 150 });
    expect(store.world.darkness).toBeCloseTo(0.2);
    gm.receive({ t: 'undo' });
    expect(store.world.darkness).toBe(1);
  });

  it('marks the chat card undone, and lets the GM undo from the latest card only', () => {
    const gm = seat('gm');
    store.setToken({ ...store.tokens.get('goblin')!, monster: 'goblin' });
    store.setToken({ ...store.tokens.get('hero')!, monster: 'bandit' });
    gm.receive({ t: 'combatStart', tokens: ['hero', 'goblin'] });
    const card = gm.take('chat')[0]!.message.id;
    gm.receive({ t: 'endTurn' });
    gm.receive({ t: 'undo', card });
    expect(errors(gm)).toEqual(['Only the latest action can be undone']);
    gm.receive({ t: 'undo' });
    expect(lastHistory(gm)).toMatchObject({ card });
    gm.receive({ t: 'undo', card });
    expect(gm.sent.filter((m) => m.t === 'error')).toEqual([]);
    expect(store.combat).toBeUndefined();
    expect(gm.take('chatUndone')).toEqual([{ t: 'chatUndone', ids: [card], undone: true }]);
    gm.receive({ t: 'redo' });
    expect(store.combat).toBeDefined();
  });
});

describe('the ops message', () => {
  it('applies a GM transaction, tells GMs the documents and is one undo step', () => {
    const gm = seat('gm');
    const ana = seat('ana');
    gm.receive({
      t: 'ops',
      txn: 't1',
      label: 'paste',
      ops: [
        { op: 'create', coll: 'main/walls', doc: { id: 'w9', type: 'wall', a: [0, 400], b: [100, 400] } },
        { op: 'delete', coll: 'main/lights', id: 'lamp' },
      ],
    });
    expect(store.chunks.get('0_0')!.walls.some((w) => w.id === 'w9')).toBe(true);
    const [docs] = gm.take('docs');
    expect(docs).toMatchObject({ txn: 't1', by: 'gm' });
    expect(docs!.changes.map((c) => [c.coll, c.id, !!c.doc])).toEqual([
      ['main/walls', 'w9', true],
      ['main/lights', 'lamp', false],
    ]);
    expect(ana.take('docs')).toEqual([]);
    gm.receive({ t: 'undo' });
    expect(store.chunks.get('0_0')!.walls.some((w) => w.id === 'w9')).toBe(false);
    expect(store.docs.get('main/lights', 'lamp')).toBeDefined();
  });

  it('refuses documents that would break their file, and all of the transaction with them', () => {
    const gm = seat('gm');
    gm.receive({
      t: 'ops',
      txn: 't2',
      ops: [
        { op: 'delete', coll: 'main/lights', id: 'lamp' },
        { op: 'create', coll: 'main/walls', doc: { id: 'w9', type: 'wall', a: [0, 400] } },
      ],
    });
    expect(gm.take('reject')).toEqual([{ t: 'reject', txn: 't2', reason: expect.stringMatching(/w9: b/) as string }]);
    expect(store.docs.get('main/lights', 'lamp')).toBeDefined();
  });

  it('refuses collections that are not there, and documents of the wrong type', () => {
    const gm = seat('gm');
    gm.receive({ t: 'ops', txn: 'a', ops: [{ op: 'create', coll: 'spells', doc: { id: 'x', type: 'spell' } }] });
    gm.receive({ t: 'ops', txn: 'b', ops: [{ op: 'create', coll: 'nope/walls', doc: { id: 'x', type: 'wall' } }] });
    gm.receive({
      t: 'ops',
      txn: 'c',
      ops: [{ op: 'create', coll: 'actors', doc: { id: 'x', type: 'wall', name: 'X' } }],
    });
    expect(gm.take('reject').map((r) => r.reason)).toEqual([
      'spells is not a collection',
      'there is no scene "nope"',
      'x: a document in actors is an actor, not a wall',
    ]);
  });

  it('keeps the table with a GM', () => {
    const gm = seat('gm');
    const players = store.world.players.map((p) => ({ ...p, role: 'player' }));
    gm.receive({ t: 'ops', txn: 't', ops: [{ op: 'update', coll: 'game', id: 'test', patch: { players } }] });
    expect(gm.take('reject')[0]!.reason).toBe('The table needs a GM');
  });

  it('leaves the tokens of a deleted actor carrying its sheet, and brings both back on undo', () => {
    const gm = seat('gm');
    gm.receive({ t: 'spawn', from: { kind: 'monster', id: 'goblin', rules: '2014' }, at: [720, 480] });
    const actor = store.docs.get('main/tokens', 'goblin-2')!.actor as string;
    gm.receive({ t: 'ops', txn: 't', ops: [{ op: 'delete', coll: 'actors', id: actor }] });
    expect(store.actors.has(actor)).toBe(false);
    expect(store.tokens.get('goblin-2')).toMatchObject({ name: 'Goblin 2', monster: 'goblin' });
    gm.receive({ t: 'undo' });
    expect(store.actors.has(actor)).toBe(true);
    expect(store.docs.get('main/tokens', 'goblin-2')).toMatchObject({ actor });
  });
});

describe('welcome', () => {
  it('gives the GM every document, players only theirs, and the scene everyone is on', () => {
    const ws = new FakeSocket();
    game.connect(ws.asWebSocket, game.findPlayer('gm')!);
    const [welcome] = ws.take('welcome');
    expect(welcome!.scene).toBe('main');
    expect(welcome!.docs!['main/tokens']!.map((d) => d.id)).toEqual(['hero', 'goblin']);
    const ana = new FakeSocket();
    game.connect(ana.asWebSocket, game.findPlayer('ana')!);
    expect(Object.keys(ana.take('welcome')[0]!.docs!).sort((a, b) => a.localeCompare(b))).toEqual([
      'actors',
      'main/tokens',
      'time',
    ]);
  });
});

async function waitFor(done: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !done(); i++) await new Promise((r) => setTimeout(r, 20));
  expect(done()).toBe(true);
}
