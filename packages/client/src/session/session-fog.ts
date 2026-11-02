import { FOG_BYTES, type FogEdit, FogMap, isGm, type Player, type Point, unionFog } from '@vtt/shared';
import type { ClientMessage, ServerMessage } from '@vtt/system-dnd5e';
import type { SessionPart, Welcome } from './session-part.ts';

// Fog of war on the client: the explored fog the server sends, and the GM's
// fog brush. Reached as `session.fog`.

/** What the GM's fog brush does when it paints. */
export type FogBrush = 'reveal' | 'hide';

/** Default brush radius, in squares. */
const BRUSH_SQUARES = 2;

/** What the fog needs of the session: your seat and a way to the server. */
export interface FogHost {
  readonly you?: Player;
  send(msg: ClientMessage): void;
}

/** What the fog tells the session. */
export interface FogEvents {
  /** The brush changed: the editor's tools redraw. */
  editorChanged(): void;
  /** Explored fog arrived. */
  fogChanged(): void;
  gridSize(): number;
}

/** Explored fog and the GM's brush, as `session.fog`. */
export class Fog implements SessionPart {
  /** GM: the fog brush in use, if any; clicks and drags on the map paint with it. */
  brush?: FogBrush;
  /** GM: brush radius in squares. */
  brushSize = BRUSH_SQUARES;
  /** GM: the seats fog edits are for (undefined: every player), and whose fog the GM looks at. */
  players?: string[];
  /** Bumped when fog changes, for the map to redraw. */
  version = 0;
  /** Explored fog on this scene, by player: your own, or (the GM) every player's. */
  private maps = new Map<string, FogMap>();

  constructor(
    private readonly s: FogHost,
    private readonly on: FogEvents,
  ) {}

  /** A player's explored fog on this scene, as this client knows it. */
  of(player: string): FogMap | undefined {
    return this.maps.get(player);
  }

  /** The fog the map shows: yours, or for the GM the players picked (all: what any of them explored). */
  shown(): FogMap | undefined {
    const you = this.s.you;
    if (!you) return undefined;
    if (!isGm(you)) return this.maps.get(you.id);
    const picked = this.players;
    return unionFog([...this.maps].filter(([id]) => !picked || picked.includes(id)).map(([, map]) => map));
  }

  setBrush(brush: FogBrush | undefined): void {
    this.brush = brush;
    this.on.editorChanged();
  }

  setBrushSize(squares: number): void {
    this.brushSize = squares;
    this.on.editorChanged();
  }

  setPlayers(players: string[] | undefined): void {
    this.players = players;
    this.version++;
    this.on.editorChanged();
  }

  /** Paints one stroke of the brush through `path`: one edit, one undo. */
  paint(path: Point[]): void {
    if (!this.brush || !path.length) return;
    this.send({ op: this.brush, path, radius: this.radius() });
  }

  /** The brush radius in map pixels. */
  radius(): number {
    return this.brushSize * this.on.gridSize();
  }

  /** Forgets what the players picked have explored on this scene. */
  reset(): void {
    this.send({ op: 'reset' });
  }

  private send(edit: FogEdit): void {
    this.s.send({ t: 'fog', edit: this.players ? { ...edit, players: this.players } : edit });
  }

  receive(msg: ServerMessage): boolean | undefined {
    if (msg.t !== 'fog') return undefined;
    let map = this.maps.get(msg.player);
    if (!map || msg.full || map.cell !== msg.cell) {
      map = new FogMap(msg.cell);
      this.maps.set(msg.player, map);
    }
    const blocks = Object.fromEntries(Object.entries(msg.blocks).filter(([, data]) => data));
    const got = FogMap.decode({ cell: msg.cell, blocks });
    for (const key of Object.keys(msg.blocks))
      map.setBlock(key, blocks[key] ? got.block(key) : new Uint8Array(FOG_BYTES));
    this.version++;
    this.on.fogChanged();
    return false;
  }

  welcome(msg: Welcome): void {
    this.maps.clear();
    this.version++;
    if (!isGm(msg.you)) this.brush = undefined;
  }
}
