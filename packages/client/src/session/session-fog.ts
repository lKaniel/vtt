import {
  FOG_BYTES,
  type FogEdit,
  fogFloor,
  FogMap,
  isGm,
  type Player,
  type Point,
  unionFog,
  type WorldInfo,
} from '@vtt/shared';
import type { ClientMessage, ServerMessage } from '@vtt/system-dnd5e';
import type { SessionPart, Welcome } from './session-part.ts';

// Fog of war on the client: the explored fog the server sends, and the GM's
// fog brush. Reached as `session.fog`.

/** What the GM's fog brush does when it paints. */
export type FogBrush = 'reveal' | 'hide';

/** Default brush radius, in squares. */
const BRUSH_SQUARES = 2;

/** What the fog needs of the session: your seat, the floor shown and a way to the server. */
export interface FogHost {
  readonly you?: Player;
  readonly world?: WorldInfo;
  /** The scene level the map shows (see session-levels.ts). */
  readonly levels: { readonly current: string | undefined };
  send(msg: ClientMessage): void;
}

/** Fog is kept per player and floor. */
const slot = (player: string, floor: string | undefined) => (floor ? `${player}\u0000${floor}` : player);

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
  /** Explored fog on this scene, by player and floor: your own, or (the GM) every player's. */
  private maps = new Map<string, FogMap>();

  constructor(
    private readonly s: FogHost,
    private readonly on: FogEvents,
  ) {}

  /** A player's explored fog on this scene's floor shown, as this client knows it. */
  of(player: string): FogMap | undefined {
    return this.maps.get(slot(player, this.floor()));
  }

  /** The fog the map shows, of the floor shown: yours, or for the GM the players picked (all: what any of them explored). */
  shown(): FogMap | undefined {
    const you = this.s.you;
    if (!you) return undefined;
    if (!isGm(you)) return this.of(you.id);
    const ids = this.players ?? [...new Set([...this.maps.keys()].map((k) => k.split('\u0000')[0]!))];
    return unionFog(ids.flatMap((id) => this.of(id) ?? []));
  }

  /** Which floor's fog the map shows: none for the street, or a scene without floors. */
  floor(): string | undefined {
    return fogFloor(this.s.world?.levels, this.s.levels.current);
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
    const level = edit.op === 'reset' ? undefined : this.s.levels.current;
    const players = this.players;
    this.s.send({ t: 'fog', edit: { ...edit, ...(players && { players }), ...(level && { level }) } });
  }

  receive(msg: ServerMessage): boolean | undefined {
    if (msg.t !== 'fog') return undefined;
    const key = slot(msg.player, msg.level);
    let map = this.maps.get(key);
    if (!map || msg.full || map.cell !== msg.cell) {
      map = new FogMap(msg.cell);
      this.maps.set(key, map);
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
