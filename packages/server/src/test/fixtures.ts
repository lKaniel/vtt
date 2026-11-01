// fallow-ignore-file unused-class-member -- Game calls FakeSocket's members through the WebSocket type
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { ActorSchema, resolveToken, TokenEntrySchema, type ServerMessage, type Token } from '@vtt/shared';
import type { WebSocket } from 'ws';

const players = [
  { id: 'gm', name: 'GM', role: 'gm' },
  { id: 'ana', name: 'Ana', role: 'player' },
  { id: 'bo', name: 'Bo', role: 'player' },
];
const walls = [
  { id: 'n', a: [0, 0], b: [300, 0] },
  { id: 'w', a: [0, 0], b: [0, 300] },
  { id: 's', a: [0, 300], b: [300, 300] },
  { id: 'e1', a: [300, 0], b: [300, 100] },
  { id: 'door', a: [300, 100], b: [300, 200], door: 'closed' },
  { id: 'e2', a: [300, 200], b: [300, 300] },
];
const lights = [{ id: 'lamp', x: 550, y: 150, bright: 10, dim: 0 }];
const hero = { id: 'hero', name: 'Hero', x: 150, y: 150, controllers: ['ana'] };
const goblin = { id: 'goblin', name: 'Goblin', x: 550, y: 150 };

async function folder(files: Record<string, unknown>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'vtt-world-'));
  for (const [rel, data] of Object.entries(files)) {
    await mkdir(dirname(join(dir, rel)), { recursive: true });
    await writeFile(join(dir, rel), JSON.stringify(data));
  }
  return dir;
}

/**
 * A night-time game with one scene, "main": a 3x3 square room (300 px) with
 * a door on its east side, a hero inside and a goblin outside to the east.
 */
export function makeWorld(): Promise<string> {
  return folder({
    'game.json': { id: 'test', name: 'Test', scene: 'main', players },
    'scenes/main/scene.json': { darkness: 1 },
    'scenes/main/tiles.json': [],
    'scenes/main/walls.json': walls,
    'scenes/main/lights.json': lights,
    'scenes/main/tokens.json': [hero, goblin],
  });
}

/** The same table in the old world layout (chunks/, tokens/), with an actor and a fight. */
export function makeLegacyWorld(): Promise<string> {
  return folder({
    'world.json': { name: 'Test', darkness: 1, players },
    'chunks/0_0.json': { walls, lights },
    'tokens/hero.json': hero,
    'tokens/goblin.json': goblin,
    'actors/bandit.json': { id: 'bandit', name: 'Bandit', monster: 'bandit' },
    'combat.json': {
      order: [{ token: 'hero', initiative: 12 }],
      left: { move: 30, action: true, bonus: true },
    },
  });
}

/** Stands in for a browser connection and records what the server sends. */
export class FakeSocket {
  readonly OPEN = 1;
  readyState = 1;
  sent: ServerMessage[] = [];
  private handlers = new Map<string, ((data: Buffer) => void)[]>();

  on(event: string, fn: (data: Buffer) => void): this {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), fn]);
    return this;
  }

  send(text: string): void {
    this.sent.push(JSON.parse(text) as ServerMessage);
  }

  close(): void {
    this.readyState = 3;
    for (const fn of this.handlers.get('close') ?? []) fn(Buffer.alloc(0));
  }

  /** Simulates the browser sending a message. */
  receive(msg: unknown): void {
    for (const fn of this.handlers.get('message') ?? []) fn(Buffer.from(JSON.stringify(msg)));
  }

  /** Messages of one kind, oldest first, and clears the log. */
  take<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }>[] {
    const out = this.sent.filter((m): m is Extract<ServerMessage, { t: T }> => m.t === t);
    this.sent = [];
    return out;
  }

  get asWebSocket(): WebSocket {
    return this as unknown as WebSocket;
  }
}

/** A token as saved in the test game's files (its entry merged with its actor), or undefined. */
export async function savedToken(dir: string, id: string): Promise<Token | undefined> {
  const read = async (rel: string) => JSON.parse(await readFile(join(dir, rel), 'utf8')) as unknown;
  const tokens = (await read('scenes/main/tokens.json')) as unknown[];
  const raw = tokens.map((t) => TokenEntrySchema.parse(t)).find((t) => t.id === id);
  if (!raw) return undefined;
  const actor = raw.actor ? ActorSchema.parse(await read(`actors/${raw.actor}.json`)) : undefined;
  return resolveToken(raw, actor).token;
}
