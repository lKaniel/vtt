import { attachedTo, type Doc, type DocRef, type DocStore, freeId, type Op, type Patch, slugify } from '@vtt/core';
import {
  applyPatch,
  applyTileEdit,
  dragHandle,
  EDIT_KINDS,
  type EditorMode,
  groupEdit,
  isGroup,
  merge,
  moveBy,
  moveIntoEdit,
  nestEdit,
  placeNewTile,
  type Point,
  type Rect,
  reorderEdit,
  scaleGroupEdit,
  snapDelta,
  tileBounds,
  type TileEdit,
  type TileTexture,
  ungroupEdit,
  withDescendants,
  type ZOrder,
} from '@vtt/shared';
import { refOf } from './editor/selection.ts';
import { TILE_PRESETS } from './map-tools.ts';

// The tiles mode's commands, like Figma's layers: moving a group moves what
// is in it, a tile dropped on another goes inside it, and group, ungroup,
// z-order, lock and the layers panel change the tile tree. The rules are in
// shared/tiles.ts; this turns them into one transaction per command.
// Reached as `session.tiles`; the editor hands it moves in the tiles mode.

/** Only the fields a patch really changes. */
function changed(doc: Doc, patch: Patch): Patch {
  return Object.fromEntries(Object.entries(patch).filter(([key, value]) => doc[key] !== value));
}

/** What the tiles need of the session: documents, the editor's mode and selection, and a way to the server. */
export interface TileHost {
  readonly docs: DocStore;
  readonly editor: {
    readonly selection: string[];
    modeColl(mode?: EditorMode): string;
    selectedDocs(): { ref: DocRef; doc: Doc }[];
    editSelection(patch: Patch, label?: string): void;
    setSelection(keys: string[]): void;
  };
  sendChanges(label: string, ops: readonly Op[]): void;
}

/** What the tiles tell the session. */
export interface TileEvents {
  /** A tool setting changed: the editor's tools redraw. */
  editorChanged(): void;
  gridSize(): number;
}

/** The tile tree and its commands, as `session.tiles`. */
export class Tiles {
  /** The tile tool draws this. */
  preset: TileTexture = 'wood';

  constructor(
    private readonly s: TileHost,
    private readonly on: TileEvents,
  ) {}

  /** The scene's tile documents. */
  all(): Doc[] {
    return this.s.docs.all(this.s.editor.modeColl('tiles'));
  }

  /** The tile ids in a list of selection keys. */
  private tileIds(keys: readonly string[]): string[] {
    const coll = this.s.editor.modeColl('tiles');
    return keys.map(refOf).flatMap((r) => (r.coll === coll ? [r.id] : []));
  }

  private tileKeys(ids: readonly string[]): string[] {
    return ids.map((id) => `${this.s.editor.modeColl('tiles')}#${id}`);
  }

  setPreset(preset: TileTexture): void {
    this.preset = preset;
    this.on.editorChanged();
  }

  /** Moves tiles (the tiles mode's drag) and what is in them, snapped. */
  moveSelection(keys: readonly string[], delta: Point, free: boolean): void {
    const d = snapDelta(delta, 'tiles', this.on.gridSize(), free);
    if (d[0] || d[1]) this.shiftTiles(this.tileIds(keys), d);
  }

  /** Arrow keys in the tiles mode. */
  nudge(dir: Point, big: boolean): void {
    const step = big ? this.on.gridSize() : 1;
    this.shiftTiles(this.tileIds(this.s.editor.selection), [dir[0] * step, dir[1] * step]);
  }

  /** Drags a handle of a group (the tiles mode); false when `key` is no group. */
  reshape(key: string, handle: string, to: Point, free: boolean): boolean {
    const tiles = this.all();
    const id = refOf(key).id;
    const group = tiles.find((t) => t.id === id && isGroup(t));
    if (!group) return false;
    const bounds = tileBounds(tiles, id);
    if (!bounds) return true;
    const shown = { ...group, ...bounds };
    const next = applyPatch(shown, dragHandle(shown, handle, to, { gridSize: this.on.gridSize(), free }));
    this.sendTileEdit('resize', scaleGroupEdit(tiles, id, next as unknown as Rect));
    return true;
  }

  /** Moves tiles and what is in them by `d`, then nests each where it landed. */
  private shiftTiles(ids: readonly string[], d: Point): void {
    const tiles = this.all();
    const moved: TileEdit = { creates: [], updates: [], deletes: [] };
    for (const id of withDescendants(tiles, ids)) {
      const doc = tiles.find((t) => t.id === id);
      const patch = doc && moveBy(doc, d);
      if (patch && Object.keys(patch).length) moved.updates.push({ id, patch });
    }
    const nest = nestEdit(applyTileEdit(tiles, moved), ids);
    const fastened = this.fastenedMoves(withDescendants(tiles, ids), d);
    this.sendTileEdit('move', { ...moved, updates: merge([...moved.updates, ...nest.updates]) }, fastened);
  }

  /** Moving tiles moves the walls and lights fastened to them. */
  private fastenedMoves(ids: readonly string[], d: Point): Op[] {
    const coll = this.s.editor.modeColl('tiles');
    const along = attachedTo(
      this.s.docs,
      EDIT_KINDS,
      ids.map((id) => ({ coll, id })),
    );
    return along.map(({ coll: at, doc }): Op => ({
      op: 'update',
      coll: at,
      id: doc.id,
      rev: doc.rev,
      patch: moveBy(doc, d),
    }));
  }

  /** Ctrl+G: puts the selected tiles in a new group, and selects it. */
  group(): void {
    const ids = this.tileIds(this.s.editor.selection);
    if (!ids.length) return;
    const tiles = this.all();
    const id = freeId('group', (i) => tiles.some((t) => t.id === i), { bare: true });
    this.sendTileEdit('group', groupEdit(tiles, ids, id));
    this.s.editor.setSelection(this.tileKeys([id]));
  }

  /** Ctrl+Shift+G: takes the selected groups apart, selecting what was in them. */
  ungroup(): void {
    const ids = this.tileIds(this.s.editor.selection);
    const edit = ungroupEdit(this.all(), ids);
    if (!edit.deletes.length) return;
    const kept = ids.filter((id) => !edit.deletes.includes(id));
    const freed = edit.updates.filter((u) => 'parent' in u.patch).map((u) => u.id);
    this.sendTileEdit('ungroup', edit);
    this.s.editor.setSelection(this.tileKeys([...kept, ...freed]));
  }

  /** Ctrl+[ and Ctrl+]: moves the selection down or up among its siblings. */
  reorder(how: ZOrder): void {
    this.sendTileEdit('reorder', reorderEdit(this.all(), this.tileIds(this.s.editor.selection), how));
  }

  /** Locks the selection (clicks and marquees pass through it), or unlocks it if it all was. */
  toggleLock(): void {
    const docs = this.s.editor.selectedDocs();
    const all = docs.length > 0 && docs.every((d) => d.doc.locked === true);
    this.s.editor.editSelection({ locked: all ? null : true }, all ? 'unlock' : 'lock');
  }

  /** Sets fields on some tiles (the layers panel's lock and rename), in one step. */
  edit(ids: readonly string[], patch: Patch, label = 'edit'): void {
    this.sendTileEdit(label, { creates: [], updates: ids.map((id) => ({ id, patch })), deletes: [] });
  }

  /** The layers panel: drops tiles into `parent` (undefined: the top) at `index` among its children, bottom up. */
  move(ids: readonly string[], parent: string | undefined, index: number): void {
    this.sendTileEdit('arrange', moveIntoEdit(this.all(), ids, parent, index));
  }

  /** The tile tool: a new tile of the current preset, inside the container under it; selects it. */
  create(r: Rect, preset: TileTexture = this.preset): void {
    const tiles = this.all();
    const look = TILE_PRESETS[preset];
    const id = freeId(preset, (i) => tiles.some((t) => t.id === i), { bare: true });
    const base: Doc = { id, type: 'tile', rev: 0, kind: 'rect', color: look.color, texture: preset, ...r };
    const doc = placeNewTile(tiles, look.background ? { ...base, background: true } : base);
    this.sendTileEdit('draw', { creates: [doc], updates: [], deletes: [] });
    this.s.editor.setSelection(this.tileKeys([id]));
  }

  /** A picture tile; it goes inside a container tile it lands on, like a drawn one. */
  createImage(r: Rect, src: string): void {
    const tiles = this.all();
    const file = src.split('/').at(-1) ?? '';
    const name = slugify(file.replace(/\.[^.]*$/, '')) || 'image';
    const id = freeId(/^[a-z0-9]/.test(name) ? name : 'image', (i) => tiles.some((t) => t.id === i), { bare: true });
    const doc = placeNewTile(tiles, { id, type: 'tile', rev: 0, kind: 'image', src, ...r });
    this.sendTileEdit('place', { creates: [doc], updates: [], deletes: [] });
    this.s.editor.setSelection(this.tileKeys([id]));
  }

  /** Sends a tile edit as one transaction, shown at once. */
  private sendTileEdit(label: string, edit: TileEdit, more: readonly Op[] = []): void {
    const coll = this.s.editor.modeColl('tiles');
    const ops: Op[] = [
      ...edit.creates.map((doc): Op => ({ op: 'create', coll, doc })),
      ...edit.updates.flatMap(({ id, patch }): Op[] => {
        const doc = this.s.docs.get(coll, id);
        const real = doc ? changed(doc, patch) : {};
        return doc && Object.keys(real).length ? [{ op: 'update', coll, id, rev: doc.rev, patch: real }] : [];
      }),
      ...edit.deletes.map((id): Op => ({ op: 'delete', coll, id })),
      ...more,
    ];
    this.s.sendChanges(label, ops);
  }
}
