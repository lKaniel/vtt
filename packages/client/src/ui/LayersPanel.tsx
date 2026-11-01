import { useRef, useState, type DragEvent } from 'react';
import { dropPlace, layerRows, type DropZone, type LayerRow } from '../editor/layers.ts';
import { clickSelect, keyOf, modsOf, refOf } from '../editor/selection.ts';
import type { Session } from '../session.ts';

const DRAG = 'application/x-vtt-layers';

/** Which part of a row the pointer is over: the top quarter, the bottom quarter, or the middle. */
function zoneAt(e: DragEvent<HTMLElement>): DropZone {
  const r = e.currentTarget.getBoundingClientRect();
  const f = (e.clientY - r.top) / r.height;
  if (f < 0.25) return 'above';
  return f > 0.75 ? 'below' : 'inside';
}

/**
 * The tiles mode's layers, like Figma's: topmost first, what is in a group
 * or container under it. Click selects (Shift adds, Ctrl removes), a double
 * click renames, drag a row above, below or onto another to reorder or nest.
 */
export function LayersPanel({ session }: Readonly<{ session: Session }>) {
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const [over, setOver] = useState<{ id: string; zone: DropZone }>();
  const [renaming, setRenaming] = useState<string>();
  const coll = session.modeColl('tiles');
  const tiles = session.tiles();
  const rows = layerRows(tiles, folded);
  const selected = new Set(session.selection.map((k) => refOf(k).id));

  const fold = (id: string) => {
    const next = new Set(folded);
    if (!next.delete(id)) next.add(id);
    setFolded(next);
  };
  const select = (row: LayerRow, e: React.MouseEvent) =>
    session.setSelection(clickSelect(session.selection, keyOf({ coll, id: row.id }), modsOf(e)));
  const startDrag = (row: LayerRow, e: DragEvent<HTMLElement>) => {
    const ids = selected.has(row.id) ? [...selected] : [row.id];
    e.dataTransfer.setData(DRAG, JSON.stringify(ids));
    e.dataTransfer.effectAllowed = 'move';
  };
  const drop = (row: LayerRow, e: DragEvent<HTMLElement>) => {
    setOver(undefined);
    const data = e.dataTransfer.getData(DRAG);
    if (!data) return;
    e.preventDefault();
    const ids = JSON.parse(data) as string[];
    const place = dropPlace(tiles, ids, row.id, zoneAt(e));
    if (place) session.moveTiles(ids, place.parent, place.index);
  };

  if (!rows.length) return <p className="layers-empty">No tiles yet: pick Draw and drag a box on the map.</p>;
  return (
    <div className="layers" role="tree" aria-label="Layers">
      {rows.map((row) => (
        <div
          key={row.id}
          role="treeitem"
          aria-selected={selected.has(row.id)}
          className={rowClass(row, selected.has(row.id), over?.id === row.id ? over.zone : undefined)}
          style={{ paddingLeft: 6 + row.depth * 14 }}
          draggable={renaming !== row.id}
          onClick={(e) => select(row, e)}
          onDragStart={(e) => startDrag(row, e)}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(DRAG)) return;
            e.preventDefault();
            setOver({ id: row.id, zone: zoneAt(e) });
          }}
          onDragLeave={() => setOver(undefined)}
          onDrop={(e) => drop(row, e)}
        >
          <RowBody
            session={session}
            row={row}
            renaming={renaming === row.id}
            onRename={(on) => setRenaming(on ? row.id : undefined)}
            onFold={() => fold(row.id)}
          />
        </div>
      ))}
    </div>
  );
}

interface RowProps {
  session: Session;
  row: LayerRow;
  renaming: boolean;
  onRename: (on: boolean) => void;
  onFold: () => void;
}

/** A row's fold arrow, kind, name (or rename box) and lock. */
function RowBody({ session, row, renaming, onRename, onFold }: Readonly<RowProps>) {
  const lock = row.locked ? null : true;
  return (
    <>
      <button
        className="layer-fold link"
        aria-label={row.open ? 'Fold' : 'Unfold'}
        disabled={!row.parent}
        onClick={(e) => {
          e.stopPropagation();
          onFold();
        }}
      >
        {foldMark(row)}
      </button>
      <span className="layer-kind">{kindMark(row)}</span>
      {renaming ? (
        <RenameBox
          row={row}
          onDone={(name) => {
            onRename(false);
            if (name !== undefined) rename(session, row.id, name);
          }}
        />
      ) : (
        <span className="layer-name" onDoubleClick={() => onRename(true)} title="Double click to rename">
          {row.label}
        </span>
      )}
      <button
        className={`layer-lock link${row.locked ? ' on' : ''}`}
        title={row.locked ? 'Unlock' : 'Lock: clicks and boxes on the map pass through it'}
        onClick={(e) => {
          e.stopPropagation();
          session.editTiles([row.id], { locked: lock }, row.locked ? 'unlock' : 'lock');
        }}
      >
        {row.locked ? '🔒' : '🔓'}
      </button>
    </>
  );
}

function foldMark(row: LayerRow): string {
  if (!row.parent) return '';
  return row.open ? '▾' : '▸';
}

function rowClass(row: LayerRow, selected: boolean, zone: DropZone | undefined): string {
  return ['layer', selected && 'selected', row.locked && 'locked', zone && `drop-${zone}`].filter(Boolean).join(' ');
}

function kindMark(row: LayerRow): string {
  if (row.group) return '▣';
  return row.ground ? '▤' : '▢';
}

function rename(session: Session, id: string, name: string): void {
  const doc = session.docs.get(session.modeColl('tiles'), id);
  if (!doc || (doc.name ?? '') === name) return;
  session.editTiles([id], { name: name || null }, 'rename');
}

function RenameBox({ row, onDone }: Readonly<{ row: LayerRow; onDone: (name?: string) => void }>) {
  const done = useRef(false);
  const finish = (name?: string) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
  };
  return (
    <input
      className="layer-rename"
      autoFocus
      defaultValue={row.label === row.id ? '' : row.label}
      placeholder={row.id}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(e.currentTarget.value.trim());
        else if (e.key === 'Escape') finish();
      }}
      onBlur={(e) => finish(e.currentTarget.value.trim())}
    />
  );
}
