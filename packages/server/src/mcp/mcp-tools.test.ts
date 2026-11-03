import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from '../game.ts';
import { GameStore } from '../store/game-store.ts';
import { mcpTools } from './mcp-tools.ts';
import { makeWorld } from '../test/fixtures.ts';

// The tools Claude gets for a live game, here for the test game's GM and Ana.

let store: GameStore;
let game: Game;

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  game = new Game(store, { rng: () => 0 });
});

afterEach(async () => {
  await store.flush();
});

function toolsFor(player: string): (name: string, args?: Record<string, unknown>) => Promise<string> {
  const tools = mcpTools({
    games: () => Promise.resolve([{ id: 'test', name: 'Test', role: player === 'gm' ? 'gm' : 'player' }]),
    seat: (id = 'test') =>
      id === 'test'
        ? Promise.resolve({ game, player: game.findPlayer(player)! })
        : Promise.reject(new Error('No such game')),
    guide: () => Promise.resolve('# Game format'),
  });
  return (name, args = {}) => {
    const tool = tools.find((t) => t.name === name)!;
    return tool.run(tool.input.parse(args) as never) as Promise<string>;
  };
}

const json = (text: string) => JSON.parse(text) as Record<string, unknown>;

describe('the Claude bridge tools', () => {
  it('list the games and read the format guide', async () => {
    const call = toolsFor('gm');
    expect(json(await call('list_games'))).toEqual({ games: [{ id: 'test', name: 'Test', role: 'gm' }] });
    expect(await call('guide')).toBe('# Game format');
  });

  it('look at the table as the seat sees it', async () => {
    const seen = json(await toolsFor('gm')('look', { game: 'test' }));
    expect(seen).toMatchObject({ you: { id: 'gm', role: 'gm' }, scene: 'main' });
    const tokens = seen.tokens as { id: string; x: number; hp?: number }[];
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens[0]).toHaveProperty('x');
  });

  it('say things and roll in chat, then read the chat back', async () => {
    const call = toolsFor('gm');
    expect(await call('say', { text: '/r 1d20+2' })).toContain('Done');
    await call('say', { text: 'The door creaks.' });
    const chat = json(await call('read_chat', { last: 1 })).chat as { text?: string }[];
    expect(chat).toEqual([expect.objectContaining({ text: 'The door creaks.' })]);
  });

  it('read and change documents within the seat’s rights', async () => {
    const gm = toolsFor('gm');
    const colls = json(await gm('list_documents')) as Record<string, number>;
    expect(colls.actors).toBeGreaterThan(0);
    const made = await gm('edit_documents', {
      ops: [{ op: 'create', coll: 'journals', doc: { id: 'plan', type: 'journal', rev: 0, name: 'Plan', pages: [] } }],
    });
    expect(made).toContain('Done');
    expect(json(await gm('get_document', { collection: 'journals', id: 'plan' }))).toMatchObject({ name: 'Plan' });
    const refused = toolsFor('ana')('edit_documents', { ops: [{ op: 'delete', coll: 'journals', id: 'plan' }] });
    await expect(refused).rejects.toThrow(/Refused/);
  });

  it('report a refused action', async () => {
    await expect(toolsFor('ana')('send', { message: { t: 'rollTable', table: 'nope' } })).rejects.toThrow(
      'No such table',
    );
  });

  it('fail on a game the seat is not at', async () => {
    await expect(toolsFor('gm')('look', { game: 'other' })).rejects.toThrow('No such game');
  });
});
