import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { isGm, type Player } from '@vtt/shared';
import { z } from 'zod';
import type { Account, AccountStore } from './accounts.ts';
import type { GameHub } from './game-hub.ts';
import { HttpError, parseBody, send } from './http-json.ts';
import { answerRpc } from './mcp-protocol.ts';
import { type BridgeTable, mcpTools } from './mcp-tools.ts';
import { repoRoot } from './paths.ts';

// The Claude bridge: POST /mcp speaks MCP (mcp-protocol.ts), so Claude Code
// or Claude Desktop can sit at a live game. A caller shows a key: one an
// account made on its page (its seats, with their rights), or the server's
// own VTT_MCP_KEY, which sits as the home game's GM.
//
//   claude mcp add --transport http vtt http://localhost:3001/mcp \
//     --header "Authorization: Bearer <key>"

interface McpDeps {
  accounts: AccountStore;
  hub: GameHub;
  mcpKey?: string;
}

/** Who a key sits as: an account (at its seats), or the server (as the home game's GM). */
type Caller = { account: Account } | { server: true };

const GUIDE = join(repoRoot, 'docs/game-format.md');

function callerOf(req: IncomingMessage, deps: McpDeps): Caller | undefined {
  const key = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '')?.[1];
  if (!key) return undefined;
  if (deps.mcpKey && key === deps.mcpKey) return { server: true };
  const account = deps.accounts.mcpAccount(key);
  return account && { account };
}

/** The caller's player in a game's seats. */
function seatIn(players: readonly Player[], caller: Caller): Player | undefined {
  return 'server' in caller ? players.find(isGm) : players.find((p) => p.id === caller.account.id);
}

function tableFor(hub: GameHub, caller: Caller): BridgeTable {
  const home = hub.homeId ? [hub.homeId] : [];
  const ids = () => ('server' in caller ? home : hub.ids());
  const games = async () => {
    const infos = await Promise.all(ids().map((id) => hub.info(id)));
    return infos.flatMap((info) => {
      const player = seatIn(info.players, caller);
      return player ? [{ id: info.id, name: info.name, role: player.role }] : [];
    });
  };
  /** Without an id: the home game if the caller sits there, else their first. */
  const pick = async (id?: string) => {
    if (id) return ids().includes(id) ? id : undefined;
    const mine = await games();
    return (mine.find((g) => g.id === hub.homeId) ?? mine[0])?.id;
  };
  const seat = async (id?: string) => {
    const picked = await pick(id);
    if (!picked) throw new Error('No such game');
    const { game, store } = await hub.open(picked);
    const player = seatIn(store.world.players, caller);
    if (!player) throw new Error('You have no seat at that game');
    return { game, player };
  };
  return { games, seat, guide: () => readFile(GUIDE, 'utf8') };
}

/** Handles /mcp; answers true when it handled the request. */
export function mcpHandler(deps: McpDeps): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  return async (req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405, { allow: 'POST' }).end();
      return true;
    }
    const caller = callerOf(req, deps);
    if (!caller) {
      send(res, 401, { error: 'Make a key on your account page and send it as "Authorization: Bearer <key>".' });
      return true;
    }
    try {
      const answer = await answerRpc(await parseBody(req, z.unknown()), mcpTools(tableFor(deps.hub, caller)));
      if (answer) send(res, 200, answer);
      else res.writeHead(202).end();
    } catch (e) {
      if (!(e instanceof HttpError)) throw e;
      send(res, e.status, { error: e.message });
    }
    return true;
  };
}
