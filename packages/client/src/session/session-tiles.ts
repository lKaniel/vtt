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
  snapOn,
  type MoveGrid,
  tileBounds,
  type TileEdit,
  type TileTexture,
  ungroupEdit,
  withDescendants,
  type ZOrder,
} from '@vtt/shared';
import { refOf } from '../editor/selection.ts';
import { TILE_PRESETS } from '../play/map-tools.ts';
import type { StampDoc } from '../editor/stamp.ts';

// The tiles mode's commands, like Figma's layers: moving a group moves what
// is in it, a tile dropped on another goes inside it, and group, ungroup,
// z-order, lock and the layers panel change the tile tree. The rules are in
// shared/tiles.ts; this turns them into one transaction per command.
// Reached as `session.tiles`; the editor hands it moves in the tiles mode.

/** A scene's map: a ground picture at the top of the tile tree. */
const isMap = (t: Doc) => t.background === true && t.kind === 'image' && t.parent === undefined;

/** A model tile is a prop, never a container. */
const notModel = (t: Doc) => !t.model;

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
  readonly edits: { sendChanges(label: string, ops: readonly Op[]): void };
  /** The floor shown, which new tiles go on. */
  readonly levels: { readonly placing: { level?: string } };
}

/** What the tiles tell the session. */
export interface TileEvents {
  /** A tool setting changed: the editor's tools redraw. */
  editorChanged(): void;
  gridSize(): number;
  /** The scene's grid, for snapping (see `snapOn`). */
  moveGrid(): MoveGrid;
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
    const d = snapDelta(delta, 'tiles', this.on.moveGrid(), free);
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
    const next = applyPatch(shown, dragHandle(shown, handle, to, snapOn(this.on.moveGrid(), free)));
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
    const base: Doc = {
      id,
      type: 'tile',
      rev: 0,
      kind: 'rect',
      color: look.color,
      texture: preset,
      ...r,
      ...this.onFloor,
    };
    const doc = placeNewTile(tiles, look.background ? { ...base, background: true } : base);
    this.sendTileEdit('draw', { creates: [doc], updates: [], deletes: [] });
    this.s.editor.setSelection(this.tileKeys([id]));
  }

  /**
   * Picture and model tiles from the stamp brush (editor/stamp.ts), as one
   * undo step: each named after its file, inside a container it lands on
   * (never a model: a prop on a prop stays loose), on the floor shown. The
   * selection stays as it is, so the inspector doesn't open over the map
   * while stamping.
   */
  stamp(stamps: readonly StampDoc[], label = 'stamp'): void {
    let tiles = this.all();
    const ids: string[] = [];
    for (const look of stamps) {
      const file = (look.model?.src ?? look.src).split('/').at(-1) ?? '';
      const name = slugify(file.replace(/\.[^.]*$/, '')) || 'image';
      const base = /^[a-z0-9]/.test(name) ? name : 'image';
      const id = freeId(base, (i) => tiles.some((t) => t.id === i), { bare: true });
      const doc = placeNewTile(tiles, { id, type: 'tile', rev: 0, kind: 'image', ...look, ...this.onFloor }, notModel);
      tiles = [...tiles, doc];
      ids.push(id);
    }
    if (!ids.length) return;
    this.sendTileEdit(label, { creates: tiles.slice(-ids.length), updates: [], deletes: [] });
  }

  /**
   * Makes a picture the map of `scene` (named: on every floor), or of the one
   * you are on, on the floor shown: the ground picture there gets it (and its size, when
   * known), or a new one goes under everything at the top left corner, as
   * big as the picture.
   */
  setMap(src: string, size?: { w: number; h: number }, scene?: string): void {
    const coll = scene ? `${scene}/tiles` : this.s.editor.modeColl('tiles');
    const tiles = this.s.docs.all(coll);
    const floor = scene ? {} : this.onFloor;
    const ground = tiles.find((t) => isMap(t) && t.level === floor.level);
    if (ground)
      return this.sendTileEdit(
        'map',
        { creates: [], updates: [{ id: ground.id, patch: { src, ...size } }], deletes: [] },
        [],
        coll,
      );
    const side = this.on.gridSize() * 20;
    const id = freeId('map', (i) => tiles.some((t) => t.id === i), { bare: true });
    const rect = { x: 0, y: 0, w: size?.w ?? side, h: size?.h ?? side };
    const doc = placeNewTile(tiles, {
      id,
      type: 'tile',
      rev: 0,
      kind: 'image',
      src,
      background: true,
      ...rect,
      ...floor,
    });
    this.sendTileEdit('map', { creates: [doc], updates: [], deletes: [] }, [], coll);
  }

  private get onFloor(): { level?: string } {
    return this.s.levels.placing;
  }

  /** Sends a tile edit as one transaction, shown at once. */
  private sendTileEdit(
    label: string,
    edit: TileEdit,
    more: readonly Op[] = [],
    coll = this.s.editor.modeColl('tiles'),
  ): void {
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
    this.s.edits.sendChanges(label, ops);
  }
}
