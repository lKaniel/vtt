import type { Doc } from '@vtt/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from '../game.ts';
import { GameStore } from '../store/game-store.ts';
import { makeWorld } from '../test/fixtures.ts';
import { mcpTools } from './mcp-tools.ts';

// Claude's recap of an evening: it reads a session log page (session-log.ts)
// and writes a short "Previously on..." page at its top.

let store: GameStore;
let game: Game;

const session = (id: string, start: number, events: string, more: object[] = []) =>
  ({
    id,
    type: 'journal',
    rev: 0,
    name: `Session ${id}`,
    book: 'log',
    session: { start, end: start + 1000 },
    pages: [...more, { id: 'events', name: 'What happened', kind: 'text', text: events }],
  }) as unknown as Doc;

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  game = new Game(store, { rng: () => 0 });
  const before = { id: 'recap', name: 'Previously on...', kind: 'text', text: 'They met at the inn.' };
  store.applyOps([
    { op: 'create', coll: 'journals', doc: session('session-2026-11-21', 1000, '- Bram got 5 gp', [before]) },
    { op: 'create', coll: 'journals', doc: session('session-2026-11-28', 9000, '- **Fight:** Bram against Goblin') },
  ]);
});

afterEach(async () => {
  await store.flush();
});

function toolsFor(player: string): (name: string, args?: Record<string, unknown>) => Promise<string> {
  const tools = mcpTools({
    games: () => Promise.resolve([{ id: 'test', name: 'Test', role: 'gm' }]),
    seat: () => Promise.resolve({ game, player: game.findPlayer(player)! }),
    guide: () => Promise.resolve(''),
  });
  return (name, args = {}) => {
    const tool = tools.find((t) => t.name === name)!;
    return tool.run(tool.input.parse(args) as never) as Promise<string>;
  };
}

const pagesOf = (id: string) =>
  (store.docs.get('journals', id) as unknown as { pages: { id: string; text?: string }[] }).pages;

describe('session recaps over the bridge', () => {
  it('read the latest session, with the recap before it and the other sessions', async () => {
    const read = JSON.parse(await toolsFor('gm')('read_session')) as Record<string, unknown>;
    expect(read).toMatchObject({
      id: 'session-2026-11-28',
      events: ['- **Fight:** Bram against Goblin'],
      previousRecap: 'They met at the inn.',
      sessions: [
        { id: 'session-2026-11-28', name: 'Session session-2026-11-28' },
        { id: 'session-2026-11-21', name: 'Session session-2026-11-21' },
      ],
    });
  });

  it('read a session by id', async () => {
    const read = JSON.parse(await toolsFor('gm')('read_session', { session: 'session-2026-11-21' })) as object;
    expect(read).toMatchObject({ events: ['- Bram got 5 gp'], recap: 'They met at the inn.' });
  });

  it('write the recap as the first page, and write it again in place', async () => {
    const call = toolsFor('gm');
    expect(await call('write_recap', { session: 'session-2026-11-28', text: 'Bram fought a goblin.' })).toContain(
      'Done',
    );
    expect(pagesOf('session-2026-11-28').map((p) => p.id)).toEqual(['recap', 'events']);
    await call('write_recap', { session: 'session-2026-11-28', text: 'Bram beat a goblin.' });
    expect(pagesOf('session-2026-11-28').map((p) => [p.id, p.text])).toEqual([
      ['recap', 'Bram beat a goblin.'],
      ['events', '- **Fight:** Bram against Goblin'],
    ]);
  });

  it("are the GM's: a player can't read or write an unshared session", async () => {
    const call = toolsFor('ana');
    await expect(call('read_session')).rejects.toThrow(/No session/);
    await expect(call('write_recap', { session: 'session-2026-11-28', text: 'x' })).rejects.toThrow();
  });
});
