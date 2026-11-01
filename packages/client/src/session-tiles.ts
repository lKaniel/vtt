import { freeId, type Doc, type Op, type Patch } from '@vtt/core';
import {
  applyPatch,
  applyTileEdit,
  dragHandle,
  groupEdit,
  isGroup,
  merge,
  moveBy,
  moveIntoEdit,
  nestEdit,
  placeNewTile,
  reorderEdit,
  scaleGroupEdit,
  snapDelta,
  tileBounds,
  ungroupEdit,
  withDescendants,
  type Point,
  type Rect,
  type TileEdit,
  type TileTexture,
  type ZOrder,
} from '@vtt/shared';
import { refOf } from './editor/selection.ts';
import { TILE_PRESETS } from './map-tools.ts';
import { EditorSession } from './session-editor.ts';

// The tiles mode's commands, like Figma's layers: moving a group moves what
// is in it, a tile dropped on another goes inside it, and group, ungroup,
// z-order, lock and the layers panel change the tile tree. The rules are in
// shared/tiles.ts; this turns them into one transaction per command.

/** Only the fields a patch really changes. */
function changed(doc: Doc, patch: Patch): Patch {
  return Object.fromEntries(Object.entries(patch).filter(([key, value]) => doc[key] !== value));
}

export abstract class TileSession extends EditorSession {
  /** The tile tool draws this. */
  tilePreset: TileTexture = 'wood';

  /** The scene's tile documents. */
  tiles(): Doc[] {
    return this.docs.all(this.modeColl('tiles'));
  }

  /** The tile ids in a list of selection keys. */
  private tileIds(keys: readonly string[]): string[] {
    const coll = this.modeColl('tiles');
    return keys.map(refOf).flatMap((r) => (r.coll === coll ? [r.id] : []));
  }

  private tileKeys(ids: readonly string[]): string[] {
    return ids.map((id) => `${this.modeColl('tiles')}#${id}`);
  }

  setTilePreset(preset: TileTexture): void {
    this.tilePreset = preset;
    this.editorChanged();
  }

  override moveSelection(keys: readonly string[], delta: Point, free: boolean): void {
    if (this.mode !== 'tiles') return super.moveSelection(keys, delta, free);
    const d = snapDelta(delta, this.mode, this.gridSize(), free);
    if (d[0] || d[1]) this.shiftTiles(this.tileIds(keys), d);
  }

  override nudge(dir: Point, big: boolean): void {
    if (this.mode !== 'tiles') return super.nudge(dir, big);
    const step = big ? this.gridSize() : 1;
    this.shiftTiles(this.tileIds(this.selection), [dir[0] * step, dir[1] * step]);
  }

  override reshape(key: string, handle: string, to: Point, free: boolean): void {
    const tiles = this.tiles();
    const id = refOf(key).id;
    const group = this.mode === 'tiles' ? tiles.find((t) => t.id === id && isGroup(t)) : undefined;
    if (!group) return super.reshape(key, handle, to, free);
    const bounds = tileBounds(tiles, id);
    if (!bounds) return;
    const shown = { ...group, ...bounds };
    const next = applyPatch(shown, dragHandle(shown, handle, to, { gridSize: this.gridSize(), free }));
    this.sendTileEdit('resize', scaleGroupEdit(tiles, id, next as unknown as Rect));
  }

  /** Moves tiles and what is in them by `d`, then nests each where it landed. */
  private shiftTiles(ids: readonly string[], d: Point): void {
    const tiles = this.tiles();
    const moved: TileEdit = { creates: [], updates: [], deletes: [] };
    for (const id of withDescendants(tiles, ids)) {
      const doc = tiles.find((t) => t.id === id);
      const patch = doc && moveBy(doc, d);
      if (patch && Object.keys(patch).length) moved.updates.push({ id, patch });
    }
    const nest = nestEdit(applyTileEdit(tiles, moved), ids);
    this.sendTileEdit('move', { ...moved, updates: merge([...moved.updates, ...nest.updates]) });
  }

  /** Ctrl+G: puts the selected tiles in a new group, and selects it. */
  group(): void {
    const ids = this.tileIds(this.selection);
    if (!ids.length) return;
    const tiles = this.tiles();
    const id = freeId('group', (i) => tiles.some((t) => t.id === i), { bare: true });
    this.sendTileEdit('group', groupEdit(tiles, ids, id));
    this.setSelection(this.tileKeys([id]));
  }

  /** Ctrl+Shift+G: takes the selected groups apart, selecting what was in them. */
  ungroup(): void {
    const ids = this.tileIds(this.selection);
    const edit = ungroupEdit(this.tiles(), ids);
    if (!edit.deletes.length) return;
    const kept = ids.filter((id) => !edit.deletes.includes(id));
    const freed = edit.updates.filter((u) => 'parent' in u.patch).map((u) => u.id);
    this.sendTileEdit('ungroup', edit);
    this.setSelection(this.tileKeys([...kept, ...freed]));
  }

  /** Ctrl+[ and Ctrl+]: moves the selection down or up among its siblings. */
  reorder(how: ZOrder): void {
    this.sendTileEdit('reorder', reorderEdit(this.tiles(), this.tileIds(this.selection), how));
  }

  /** Locks the selection (clicks and marquees pass through it), or unlocks it if it all was. */
  toggleLock(): void {
    const docs = this.selectedDocs();
    const all = docs.length > 0 && docs.every((d) => d.doc.locked === true);
    this.editSelection({ locked: all ? null : true }, all ? 'unlock' : 'lock');
  }

  /** Sets fields on some tiles (the layers panel's lock and rename), in one step. */
  editTiles(ids: readonly string[], patch: Patch, label = 'edit'): void {
    this.sendTileEdit(label, { creates: [], updates: ids.map((id) => ({ id, patch })), deletes: [] });
  }

  /** The layers panel: drops tiles into `parent` (undefined: the top) at `index` among its children, bottom up. */
  moveTiles(ids: readonly string[], parent: string | undefined, index: number): void {
    this.sendTileEdit('arrange', moveIntoEdit(this.tiles(), ids, parent, index));
  }

  /** The tile tool: a new tile of the current preset, inside the container under it; selects it. */
  createTile(r: Rect, preset: TileTexture = this.tilePreset): void {
    const tiles = this.tiles();
    const look = TILE_PRESETS[preset];
    const id = freeId(preset, (i) => tiles.some((t) => t.id === i), { bare: true });
    const base: Doc = { id, type: 'tile', rev: 0, kind: 'rect', color: look.color, texture: preset, ...r };
    const doc = placeNewTile(tiles, look.background ? { ...base, background: true } : base);
    this.sendTileEdit('draw', { creates: [doc], updates: [], deletes: [] });
    this.setSelection(this.tileKeys([id]));
  }

  /** Sends a tile edit as one transaction, shown at once. */
  private sendTileEdit(label: string, edit: TileEdit): void {
    const coll = this.modeColl('tiles');
    const ops: Op[] = [
      ...edit.creates.map((doc): Op => ({ op: 'create', coll, doc })),
      ...edit.updates.flatMap(({ id, patch }): Op[] => {
        const doc = this.docs.get(coll, id);
        const real = doc ? changed(doc, patch) : {};
        return doc && Object.keys(real).length ? [{ op: 'update', coll, id, rev: doc.rev, patch: real }] : [];
      }),
      ...edit.deletes.map((id): Op => ({ op: 'delete', coll, id })),
    ];
    this.sendChanges(label, ops);
  }
}
