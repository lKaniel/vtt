import type { Actor, ClientMessage, SheetArea, SpawnSource, TokenView } from '@vtt/system-dnd5e';
import type { Point, WorldInfo } from '@vtt/shared';
import type { Draft } from '../editor/shape-tools.ts';
import { dropMessage, type DragPayload, sheetDropMessage } from '../play/drops.ts';
import type { SheetTarget } from './session-sheets.ts';

// What the session does with a drop: pictures become tiles and journal
// entries notes here; the rest goes to the server (see drops.ts).

/** What drops need of the session. */
export interface DropHost {
  readonly world?: WorldInfo;
  readonly tokens: ReadonlyMap<string, TokenView>;
  readonly actors: ReadonlyMap<string, Actor>;
  readonly sheets: { readonly current?: SheetTarget };
  readonly draw: { create(draft: Draft): void };
  readonly requests: { saveActor(actor: Actor): void };
  send(msg: ClientMessage): void;
  showError(message: string): void;
}

/** What drops tell the session. */
export interface DropEvents {
  changed(): void;
  /** A picture let go on the map becomes a tile (see session-packs.ts). */
  placeMedia(src: string, at: Point, size?: { w: number; h: number }): void;
}

export class Drops {
  /** GM only: creatures dropped on the map arrive hidden from the players. */
  hidden = false;

  constructor(
    private readonly s: DropHost,
    private readonly on: DropEvents,
  ) {}

  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    this.on.changed();
  }

  spawn(from: SpawnSource, at: Point): void {
    this.s.send({ t: 'spawn', from, at, hidden: this.hidden });
  }

  /** Something dragged from the side panel or a sheet's inventory, let go on the map at `p`. */
  onMap(payload: DragPayload, p: Point): void {
    const s = this.s;
    if (!s.world) return;
    if (payload.kind === 'media') {
      const size = payload.w && payload.h ? { w: payload.w, h: payload.h } : undefined;
      return this.on.placeMedia(payload.src, p, size);
    }
    if (payload.kind === 'journal') {
      return s.draw.create({ mode: 'notes', data: { x: p[0], y: p[1], entry: payload.id, label: payload.name } });
    }
    const ctx = { tokens: s.tokens.values(), gridSize: s.world.gridSize, hidden: this.hidden };
    this.send(dropMessage(payload, p, ctx));
  }

  /** Something let go on `target`'s sheet (else the front one), on its `area` when it landed on one. */
  onSheet(payload: DragPayload, area?: SheetArea, target: SheetTarget | undefined = this.s.sheets.current): void {
    if (!target) return;
    const actor = target.kind === 'actor' ? this.s.actors.get(target.id) : undefined;
    if (actor && payload.kind === 'media') return this.s.requests.saveActor({ ...actor, img: payload.src });
    this.send(sheetDropMessage(payload, { kind: target.kind, id: target.id }, area));
  }

  private send(msg: ClientMessage | { error: string } | undefined): void {
    if (!msg) return;
    if ('error' in msg) this.s.showError(msg.error);
    else this.s.send(msg);
  }
}
