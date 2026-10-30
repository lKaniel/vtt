// fallow-ignore-file unused-class-member -- Game calls FakeSocket's members through the WebSocket type
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ServerMessage } from '@vtt/shared';
import type { WebSocket } from 'ws';

/**
 * A night-time world: a 3x3 square room (300 px) with a door on its east
 * side, a hero inside and a goblin outside to the east.
 */
export async function makeWorld(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'vtt-world-'));
  await mkdir(join(dir, 'chunks'));
  await mkdir(join(dir, 'tokens'));
  const json = (rel: string, data: unknown) => writeFile(join(dir, rel), JSON.stringify(data));
  await json('world.json', {
    name: 'Test',
    darkness: 1,
    players: [
      { id: 'gm', name: 'GM', role: 'gm' },
      { id: 'ana', name: 'Ana', role: 'player' },
      { id: 'bo', name: 'Bo', role: 'player' },
    ],
  });
  await json('chunks/0_0.json', {
    walls: [
      { id: 'n', a: [0, 0], b: [300, 0] },
      { id: 'w', a: [0, 0], b: [0, 300] },
      { id: 's', a: [0, 300], b: [300, 300] },
      { id: 'e1', a: [300, 0], b: [300, 100] },
      { id: 'door', a: [300, 100], b: [300, 200], door: 'closed' },
      { id: 'e2', a: [300, 200], b: [300, 300] },
    ],
    lights: [{ id: 'lamp', x: 550, y: 150, bright: 10, dim: 0 }],
  });
  await json('tokens/hero.json', { id: 'hero', name: 'Hero', x: 150, y: 150, controllers: ['ana'] });
  await json('tokens/goblin.json', { id: 'goblin', name: 'Goblin', x: 550, y: 150 });
  return dir;
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
