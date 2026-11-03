import type { Player } from '@vtt/shared';
import type { ClientMessage, TokenView } from '@vtt/system-dnd5e';
import { z } from 'zod';
import type { Game } from '../game.ts';
import type { McpTool } from './mcp-protocol.ts';
import { act, look, outcome, type Welcome } from './mcp-seat.ts';
import { assetTools } from './asset-tools.ts';
import { sceneTools } from './scene-tools.ts';

// The tools Claude gets over the bridge (mcp-http.ts): look at a live game
// as the caller's seat, read and change its documents, talk and roll in
// chat, move tokens, and send any message a browser could. Everything goes
// through the game as that seat, so the GM's rights stay the GM's.

/** The games one caller may reach, and their seat in each. */
export interface BridgeTable {
  games(): Promise<{ id: string; name: string; role: string }[]>;
  /** The caller's seat in game `id` (none: their default game); rejects when they have none there. */
  seat(id?: string): Promise<{ game: Game; player: Player }>;
  /** The game format guide (docs/game-format.md). */
  guide(): Promise<string>;
}

const game = z.string().optional().describe('The game id (from list_games); leave out for your default game.');
const ON_GAME = { game };

const out = (value: unknown) => JSON.stringify(value);

/** A token as Claude needs it: where it is and how it is doing. */
function tokenSummary(t: TokenView) {
  const sheet = t.sheet;
  return {
    id: t.id,
    name: t.name,
    x: t.x,
    y: t.y,
    ...(t.actor && { actor: t.actor }),
    ...(t.hidden && { hidden: true }),
    ...(sheet ? { hp: sheet.hp, maxHp: sheet.maxHp, ac: sheet.ac } : t.health && { health: t.health }),
  };
}

function lookSummary(w: Welcome) {
  const docs = Object.fromEntries(Object.entries(w.docs ?? {}).map(([coll, list]) => [coll, list.length]));
  return {
    game: w.world.name,
    you: { id: w.you.id, name: w.you.name, role: w.you.role },
    scene: w.scene,
    sceneName: w.sceneName,
    activeScene: w.active,
    ...(w.paused && { paused: true }),
    ...(w.players && { players: w.players.map((p) => ({ id: p.id, name: p.name, role: p.role })) }),
    combat: w.combat,
    tokens: w.tokens.map(tokenSummary),
    documents: docs,
  };
}

function lookTools(table: BridgeTable): McpTool[] {
  const seen = async (id?: string) => {
    const { game, player } = await table.seat(id);
    return look(game, player);
  };
  return [
    {
      name: 'guide',
      description: 'The game format: how scenes, tokens, actors, walls, lights and journals are stored. Read it first.',
      input: z.object({}),
      run: () => table.guide(),
    },
    {
      name: 'list_games',
      description: 'The games you have a seat at, and your role in each.',
      input: z.object({}),
      run: async () => out({ games: await table.games() }),
    },
    {
      name: 'look',
      description:
        'The table as your seat sees it: scene, tokens (pixels; squares are gridSize wide), combat, players.',
      input: z.object(ON_GAME),
      run: async (a: { game?: string }) => out(lookSummary(await seen(a.game))),
    },
    {
      name: 'read_chat',
      description: 'The last chat messages and roll cards you may read.',
      input: z.object({ ...ON_GAME, last: z.number().int().min(1).max(200).default(20) }),
      run: async (a: { game?: string; last: number }) => out({ chat: (await seen(a.game)).chat.slice(-a.last) }),
    },
    {
      name: 'list_documents',
      description:
        'Without collection: each collection you may read and how many documents it has. With one: its documents (id and name).',
      input: z.object({ ...ON_GAME, collection: z.string().optional() }),
      run: async (a: { game?: string; collection?: string }) => {
        const docs = (await seen(a.game)).docs ?? {};
        if (!a.collection) return out(Object.fromEntries(Object.entries(docs).map(([c, l]) => [c, l.length])));
        return out((docs[a.collection] ?? []).map((d) => ({ id: d.id, name: d.name })));
      },
    },
    {
      name: 'get_document',
      description: 'One document in full, e.g. collection "actors" or "<scene>/walls".',
      input: z.object({ ...ON_GAME, collection: z.string(), id: z.string() }),
      run: async (a: { game?: string; collection: string; id: string }) => {
        const doc = (await seen(a.game)).docs?.[a.collection]?.find((d) => d.id === a.id);
        if (!doc) throw new Error(`No document ${a.id} in ${a.collection}`);
        return out(doc);
      },
    },
  ];
}

const OpSchema = z.union([
  z.object({ op: z.literal('create'), coll: z.string(), doc: z.record(z.string(), z.unknown()) }),
  z.object({ op: z.literal('update'), coll: z.string(), id: z.string(), patch: z.record(z.string(), z.unknown()) }),
  z.object({ op: z.literal('delete'), coll: z.string(), id: z.string() }),
]);

function actTools(table: BridgeTable): McpTool[] {
  const send = async (id: string | undefined, msgs: unknown[]) => {
    const { game, player } = await table.seat(id);
    return outcome(await act(game, player, msgs as ClientMessage[]));
  };
  let txns = 0;
  return [
    {
      name: 'say',
      description: 'Posts to chat as you: words, or a command such as "/r 1d20+5 stealth" or "/gmr 2d6".',
      input: z.object({ ...ON_GAME, text: z.string().min(1).max(2000) }),
      run: (a: { game?: string; text: string }) => send(a.game, [{ t: 'chat', text: a.text }]),
    },
    {
      name: 'move_token',
      description: 'Walks a token to a point (pixels), as a move on the map: walls and turns apply.',
      input: z.object({ ...ON_GAME, token: z.string(), x: z.number(), y: z.number() }),
      run: (a: { game?: string; token: string; x: number; y: number }) =>
        send(a.game, [{ t: 'move', token: a.token, to: [a.x, a.y] }]),
    },
    {
      name: 'edit_documents',
      description:
        'Creates, changes or deletes documents in one undoable step, all or nothing. A created doc needs id, type ' +
        '(token, actor, wall, light, tile, journal...) and rev 0; an update patch sets fields (null removes one).',
      input: z.object({ ...ON_GAME, label: z.string().max(40).optional(), ops: z.array(OpSchema).min(1).max(500) }),
      run: (a: { game?: string; label?: string; ops: unknown[] }) =>
        send(a.game, [{ t: 'ops', txn: `claude-${++txns}`, label: a.label ?? 'Claude', ops: a.ops }]),
    },
    {
      name: 'undo',
      description: 'Undoes your last step.',
      input: z.object(ON_GAME),
      run: (a: { game?: string }) => send(a.game, [{ t: 'undo' }]),
    },
    {
      name: 'send',
      description:
        'Sends any message a browser could (e.g. {"t":"combatStart","tokens":[...]}, {"t":"runMacro","macro":"id"}).',
      input: z.object({ ...ON_GAME, message: z.looseObject({ t: z.string() }) }),
      run: (a: { game?: string; message: unknown }) => send(a.game, [a.message]),
    },
  ];
}

export function mcpTools(table: BridgeTable): McpTool[] {
  return [...lookTools(table), ...actTools(table), ...sceneTools(table), ...assetTools(table)];
}
