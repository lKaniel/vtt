import type { Actor, ClientMessage, SheetArea, SpawnSource, TokenView } from '@vtt/system-dnd5e';
import type { Playlist, Point, WorldInfo } from '@vtt/shared';
import { type Draft, SOUND_FT } from '../editor/shape-tools.ts';
import { dropMessage, type DragPayload, type PrefabRef, sheetDropMessage } from '../play/drops.ts';
import type { SheetTarget } from './session-sheets.ts';

// What the session does with a drop: pictures become tiles, journal entries
// and roll tables notes, playlists sounds here; a class opens the sheet's
// level up; the rest goes to the server (see drops.ts).

/** What drops need of the session. */
export interface DropHost {
  readonly world?: WorldInfo;
  readonly tokens: ReadonlyMap<string, TokenView>;
  readonly actors: ReadonlyMap<string, Actor>;
  readonly sheets: { readonly current?: SheetTarget; askLevelUp(target: SheetTarget, cls: string): void };
  readonly docs: { get(coll: string, id: string): object | undefined };
  readonly draw: { create(draft: Draft): void };
  readonly requests: { saveActor(actor: Actor): void };
  /** A prefab let go on the map is placed there (see session-packs.ts). */
  readonly packs: { placePrefab(ref: PrefabRef, at: Point): void };
  send(msg: ClientMessage): void;
  showError(message: string): void;
}

/** What drops tell the session. */
export interface DropEvents {
  changed(): void;
  /** A picture let go on the map becomes a tile (see session-packs.ts). */
  placeMedia(src: string, at: Point, size?: { w: number; h: number }): void;
}

/** The pin a roll table's note wears. */
const TABLE_ICON = '🎲';

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
    if (payload.kind === 'table') {
      const data = { x: p[0], y: p[1], table: payload.id, label: payload.name, icon: TABLE_ICON };
      return s.draw.create({ mode: 'notes', data });
    }
    if (payload.kind === 'playlist') return this.placePlaylist(payload.id, p);
    if (payload.kind === 'prefab') {
      const { pack, compendium, id } = payload;
      return s.packs.placePrefab({ pack, compendium, id }, p);
    }
    const ctx = { tokens: [...s.tokens.values()], gridSize: s.world.gridSize, hidden: this.hidden };
    this.send(dropMessage(payload, p, ctx));
  }

  /** Something let go on `target`'s sheet (else the front one), on its `area` when it landed on one. */
  onSheet(payload: DragPayload, area?: SheetArea, target: SheetTarget | undefined = this.s.sheets.current): void {
    if (!target) return;
    if (payload.kind === 'class') return this.s.sheets.askLevelUp(target, payload.id);
    const actor = target.kind === 'actor' ? this.s.actors.get(target.id) : undefined;
    if (actor && payload.kind === 'media') return this.s.requests.saveActor({ ...actor, img: payload.src });
    this.send(sheetDropMessage(payload, { kind: target.kind, id: target.id }, area));
  }

  /** A playlist as sounds at `p`: its first track, or every track when they play together. */
  private placePlaylist(id: string, p: Point): void {
    const list = this.s.docs.get('playlists', id) as Playlist | undefined;
    if (!list) return;
    const tracks = list.mode === 'together' ? list.tracks : list.tracks.slice(0, 1);
    if (!tracks.length) return this.s.showError(`${list.name} has no tracks`);
    for (const track of tracks) {
      const data = { x: p[0], y: p[1], src: track.src, radius: SOUND_FT, name: `${list.name}: ${track.name}` };
      this.s.draw.create({
        mode: 'sounds',
        data: { ...data, ...(track.volume !== undefined && { volume: track.volume }) },
      });
    }
  }

  private send(msg: ClientMessage | { error: string } | undefined): void {
    if (!msg) return;
    if ('error' in msg) this.s.showError(msg.error);
    else this.s.send(msg);
  }
}
