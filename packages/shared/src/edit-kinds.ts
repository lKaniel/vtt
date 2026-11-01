import {
  type Clip,
  copyDocs,
  deleteOps,
  type Doc,
  type DocRef,
  type Kind,
  type Kinds,
  type Op,
  pasteOffset,
  pasteOps,
} from '@vtt/core';

// The game's document types as edit commands see them (see clipboard.ts in
// core): copy, cut, paste, duplicate and delete use this one table. A new
// type joins the commands by adding itself here; the shared edit-commands
// test then runs it through every command.

type Point = [number, number];

const num = (doc: Doc, key: string): number => doc[key] as number;
const add = ([x, y]: Point, dx: number, dy: number): Point => [x + dx, y + dy];

/** A placeable that sits at its x, y. */
function atXY(name: string, extra: Partial<Kind> = {}): Kind {
  return {
    coll: (scene) => `${scene}/${name}`,
    anchor: (d) => [num(d, 'x'), num(d, 'y')],
    shift: (d, dx, dy) => ({ ...d, x: num(d, 'x') + dx, y: num(d, 'y') + dy }),
    ...extra,
  };
}

/** A placeable that is a run of points (a region, a polygon drawing), or a box at x, y. */
function pointsOrXY(name: string, extra: Partial<Kind> = {}): Kind {
  const points = (d: Doc) => d.points as Point[] | undefined;
  return {
    coll: (scene) => `${scene}/${name}`,
    anchor: (d) => points(d)?.[0] ?? [num(d, 'x'), num(d, 'y')],
    shift: (d, dx, dy) => {
      const pts = points(d);
      return pts
        ? { ...d, points: pts.map((p) => add(p, dx, dy)) }
        : { ...d, x: num(d, 'x') + dx, y: num(d, 'y') + dy };
    },
    ...extra,
  };
}

export const EDIT_KINDS: Kinds = {
  token: atXY('tokens', { refs: { actor: 'actor', leader: 'token', 'summon.by': 'token' } }),
  light: atXY('lights'),
  // Tiles sit in groups and containers (see tiles.ts); a group has no place of its own.
  tile: atXY('tiles', {
    refs: { parent: 'tile' },
    parent: 'parent',
    dropsWhenEmpty: (d) => d.kind === 'group',
    anchor: (d) => (d.kind === 'group' ? undefined : [num(d, 'x'), num(d, 'y')]),
    shift: (d, dx, dy) => (d.kind === 'group' ? d : { ...d, x: num(d, 'x') + dx, y: num(d, 'y') + dy }),
  }),
  wall: {
    coll: (scene) => `${scene}/walls`,
    anchor: (d) => {
      const [a, b] = [d.a as Point, d.b as Point];
      return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    },
    shift: (d, dx, dy) => ({ ...d, a: add(d.a as Point, dx, dy), b: add(d.b as Point, dx, dy) }),
  },
  drawing: pointsOrXY('drawings'),
  note: atXY('notes', { refs: { entry: 'journal' } }),
  template: atXY('templates', { refs: { attachedTo: 'token', 'effect.token': 'token' } }),
  region: pointsOrXY('regions'),
  sound: atXY('sounds'),
  actor: { coll: () => 'actors' },
  journal: { coll: () => 'journals' },
  rolltable: { coll: () => 'tables' },
  playlist: { coll: () => 'playlists' },
};

interface Source {
  get(coll: string, id: string): Doc | undefined;
  all(coll: string): Doc[];
  /** Every collection with documents in it; with it, pasted tokens get ids no scene uses. */
  collections?(): string[];
}

/** The source with a token id taken when any scene has a token by that id: token ids are the game's. */
function tokenIdsAcrossScenes(src: Source): Source {
  const tokenColls = src.collections?.().filter((c) => c.endsWith('/tokens'));
  if (!tokenColls) return src;
  return {
    all: (coll) => src.all(coll),
    get: (coll, id) =>
      coll.endsWith('/tokens')
        ? (src.get(coll, id) ?? tokenColls.map((c) => src.get(c, id)).find(Boolean))
        : src.get(coll, id),
  };
}

/** Copies documents (and what sits in them) for the clipboard. */
export function copyRefs(src: Source, refs: readonly DocRef[]): Clip {
  return copyDocs(src, EDIT_KINDS, refs);
}

/** The ops that paste a copy onto `scene`, moved by `offset`, with fresh ids. */
export function pasteAt(src: Source, clip: Clip, at: { scene: string; offset: Point }): { ops: Op[]; ids: string[] } {
  return pasteOps(tokenIdsAcrossScenes(src), EDIT_KINDS, clip, at);
}

/** The ops that delete documents and what sits in them. */
export function deleteRefs(src: Source, refs: readonly DocRef[]): Op[] {
  return deleteOps(src, EDIT_KINDS, refs);
}

/** How far to move a copy so its middle lands on `at`, in whole squares. */
export function pasteOffsetTo(clip: Clip, at: Point, gridSize: number): Point {
  return pasteOffset(EDIT_KINDS, clip, at, gridSize);
}
