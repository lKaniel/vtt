import type { Doc, DocRef, Patch } from '@vtt/core';
import {
  type EditorMode,
  type MapEdit,
  type Point,
  type TileRepeat,
  type WallRules,
  wallPreset,
  type ZOrder,
} from '@vtt/shared';
import type { TokenView } from '@vtt/system-dnd5e';
import { LIGHT_PRESETS, type LightPreset } from '../play/map-tools.ts';
import type { Draft } from './shape-tools.ts';
import { presetPatch } from './wall-fields.ts';
import { shuffledRepeat } from './repeat-fields.ts';

// Right-click menus. Each kind of thing registers the entries it adds, so a
// new placeable (or a game system) brings its own without touching the
// canvas code; the shared entries (copy, cut, duplicate, delete) come with
// any selection.

export interface MenuItem {
  label: string;
  run: () => void;
  /** Drawn in red: it removes something. */
  danger?: boolean;
}

/** What the menu works with: a slice of the session. */
export interface MenuApi {
  isGm(): boolean;
  canEdit(id: string): boolean;
  /** The shape tools (see session-items.ts). */
  readonly draw: { create(draft: Draft): void };
  /** Copy, cut, paste, duplicate and delete (see session-edits.ts). */
  readonly edits: {
    copy(): string | undefined;
    cut(): string | undefined;
    paste(): void;
    duplicate(): void;
    deleteSelected(): void;
  };
  readonly sheets: { open(target: { kind: 'token'; id: string }, edit?: boolean): void };
  /** Plain requests to the server (see session-requests.ts). */
  readonly requests: { move(token: string, to: Point): void; editMap(edit: MapEdit): void };
  /** The tiles mode's commands (see session-tiles.ts). */
  readonly tiles: { group(): void; ungroup(): void; reorder(how: ZOrder): void; toggleLock(): void };
  /** The editor's selection and tools (see session-editor.ts). */
  readonly editor: {
    /** Copy, cut and delete may work on the selection (the GM's, or a player's own drawings). */
    canEditSelection(): boolean;
    editSelection(patch: Patch, label?: string): void;
    selectAll(): void;
    readonly lightPreset: LightPreset;
  };
  /** The creatures you target (see targets.ts). */
  readonly targets: { readonly mine: ReadonlySet<string>; toggle(id: string): void };
  /** The token HUD, and the GM's view through a creature's eyes (see session-hud.ts). */
  readonly hud: {
    open(token: string, screen: Point): void;
    readonly observing?: string;
    observe(token: string | undefined): void;
  };
  /** Journal entries and pictures (see session-journal.ts); show is the GM's, for every player. */
  readonly journal: {
    open(entry: string, page?: string): void;
    show(entry: string, page?: string): void;
    showImage(src: string, title?: string): void;
    rollTable(table: string, gmOnly?: boolean): void;
  };
  /** The pile window (see session-piles.ts). */
  /** The scenes (see session-scenes.ts). */
  readonly scenes: { fitGrid(size: number): void };
  readonly piles: { open(token: string): void };
}

/** What the menu was opened on. */
export interface MenuTarget {
  mode: EditorMode;
  /** Where on the map (map pixels). */
  at: Point;
  /** The selection the menu acts on; empty for the ground. */
  docs: { ref: DocRef; doc: Doc }[];
  /** In the tokens mode: the token under the pointer, or the one selected for a ground menu. */
  token?: TokenView;
  /** A ground menu's creature under the pointer that you don't control (to target it). */
  under?: TokenView;
  /** Where the menu opens, in screen pixels (the token HUD opens there too). */
  screen?: Point;
  /** The object under the pointer's entries (inspect, open, use: play/object-uses.ts), listed first. */
  uses?: MenuItem[];
}

type Entry = MenuItem | false | undefined;
export type MenuSource = (target: MenuTarget, api: MenuApi) => Entry[];

const sources = new Map<string, MenuSource[]>();

/** Adds entries to the menu of one document type, of 'ground' (nothing under the pointer) or 'selection' (anything). */
export function registerMenu(on: string, source: MenuSource): () => void {
  const list = sources.get(on) ?? [];
  sources.set(on, [...list, source]);
  return () =>
    sources.set(
      on,
      (sources.get(on) ?? []).filter((s) => s !== source),
    );
}

const run = (on: string, target: MenuTarget, api: MenuApi): MenuItem[] =>
  (sources.get(on) ?? []).flatMap((source) => source(target, api)).filter((e): e is MenuItem => !!e);

/** The menu for a target: its type's entries then the shared ones, or the ground's. */
export function menuFor(target: MenuTarget, api: MenuApi): MenuItem[] {
  const type = target.docs[0]?.doc.type;
  const uses = target.uses ?? [];
  if (!type) return [...uses, ...run('ground', target, api)];
  return [...uses, ...run(type, target, api), ...run('selection', target, api)];
}

// Built-in entries ---------------------------------------------------------------

/** Puts a copy on the system clipboard too, so Ctrl+V and other tabs paste it. */
function toClipboard(text: string | undefined): void {
  if (text) navigator.clipboard.writeText(text).catch(() => undefined);
}

const allDocs = (t: MenuTarget, test: (doc: Doc) => boolean): boolean => t.docs.every((d) => test(d.doc));

registerMenu('selection', (_t, api) =>
  api.editor.canEditSelection()
    ? [
        { label: 'Copy', run: () => toClipboard(api.edits.copy()) },
        { label: 'Cut', run: () => toClipboard(api.edits.cut()) },
        { label: 'Duplicate', run: () => api.edits.duplicate() },
        { label: 'Delete', run: () => api.edits.deleteSelected(), danger: true },
      ]
    : [],
);

registerMenu('token', (t, api) => {
  const id = t.token?.id;
  if (!id) return [];
  const hidden = allDocs(t, (d) => d.hidden === true);
  return [
    !t.uses?.length && openEntry(t.token, id, api),
    hudEntry(id, t.screen, api),
    api.canEdit(id) && { label: 'Edit sheet', run: () => api.sheets.open({ kind: 'token', id }, true) },
    api.isGm() && {
      label: hidden ? 'Reveal to players' : 'Hide from players',
      run: () => api.editor.editSelection({ hidden: hidden ? null : true }, hidden ? 'reveal' : 'hide'),
    },
    targetEntry(id, api),
    api.isGm() && observeEntry(id, api),
    artEntry(t.token, api),
    ...(api.isGm() ? pileEntries(t.token?.pile, api) : []),
  ];
});

/** A creature's sheet, or a pile's window. */
const openEntry = (token: TokenView | undefined, id: string, api: MenuApi): MenuItem =>
  token?.pile
    ? { label: `Open ${token.name}`, run: () => api.piles.open(id) }
    : { label: 'Open sheet', run: () => api.sheets.open({ kind: 'token', id }) };

/** GM: makes a token a pile of loot or a merchant (see system-dnd5e piles.ts), locks it, or makes it a token again. */
function pileEntries(pile: TokenView['pile'], api: MenuApi): MenuItem[] {
  const set = (to: Partial<NonNullable<TokenView['pile']>> | null, label: string) => () =>
    api.editor.editSelection({ pile: to }, label);
  if (!pile) {
    return [
      { label: 'Make it a pile of loot', run: set({ kind: 'loot' }, 'pile') },
      { label: 'Make it a merchant', run: set({ kind: 'merchant' }, 'merchant') },
    ];
  }
  const { locked, ...open } = pile;
  const other = pile.kind === 'merchant' ? 'loot' : 'merchant';
  return [
    locked
      ? { label: 'Unlock it', run: set(open, 'unlock') }
      : { label: 'Lock it', run: set({ ...pile, locked: true }, 'lock') },
    {
      label: other === 'loot' ? 'Make it a pile of loot' : 'Make it a merchant',
      run: set({ kind: other }, other === 'loot' ? 'pile' : 'merchant'),
    },
    { label: 'Stop being a pile', run: set(null, 'not a pile'), danger: true },
  ];
}

/** GM: see the map as this creature's players do (light, sight, fog), or stop. */
const observeEntry = (id: string, api: MenuApi): MenuItem =>
  api.hud.observing === id
    ? { label: 'Stop seeing through its eyes', run: () => api.hud.observe(undefined) }
    : { label: 'See through its eyes', run: () => api.hud.observe(id) };

const hudEntry = (id: string, screen: Point | undefined, api: MenuApi): Entry =>
  !!screen && { label: 'Token HUD', run: () => api.hud.open(id, screen) };

/** GM: show a creature's picture to the players. */
function artEntry(token: TokenView | undefined, api: MenuApi): Entry {
  const src = token?.img ?? token?.art;
  return api.isGm() && !!src && { label: 'Show art to players', run: () => api.journal.showImage(src, token?.name) };
}

/** Target a creature, or stop (see targets.ts). */
const targetEntry = (id: string, api: MenuApi): MenuItem => ({
  label: api.targets.mine.has(id) ? 'Stop targeting' : 'Target',
  run: () => api.targets.toggle(id),
});

const WALL_KINDS: { label: string; is: (d: Doc) => boolean; patch: Patch }[] = (
  ['wall', 'door', 'window'] as const
).map((kind) => ({
  label: `Make it a ${kind}`,
  is: (d) => wallPreset(d as WallRules) === kind,
  patch: presetPatch(kind),
}));

registerMenu('wall', (t, api) => {
  const kinds = WALL_KINDS.filter((k) => !allDocs(t, k.is)).map((k) => ({
    label: k.label,
    run: () => api.editor.editSelection(k.patch),
  }));
  if (!allDocs(t, (d) => !!d.door)) return kinds;
  const locked = allDocs(t, (d) => d.door === 'locked');
  const open = allDocs(t, (d) => d.door === 'open');
  return [
    ...kinds,
    { label: open ? 'Close' : 'Open', run: () => api.editor.editSelection({ door: open ? 'closed' : 'open' }) },
    { label: locked ? 'Unlock' : 'Lock', run: () => api.editor.editSelection({ door: locked ? 'closed' : 'locked' }) },
  ];
});

registerMenu('light', (t, api) => {
  const steady = allDocs(t, (d) => !d.animation);
  const dark = allDocs(t, (d) => d.darkness === true);
  return [
    {
      label: steady ? 'Flicker' : 'Hold steady',
      run: () => api.editor.editSelection({ animation: steady ? 'flicker' : null }),
    },
    {
      label: dark ? 'Make it light' : 'Make it magical darkness',
      run: () => api.editor.editSelection({ darkness: dark ? null : true }),
    },
  ];
});

const Z_ORDER: { label: string; how: ZOrder }[] = [
  { label: 'Bring to front', how: 'front' },
  { label: 'Bring forward', how: 'forward' },
  { label: 'Send backward', how: 'backward' },
  { label: 'Send to back', how: 'back' },
];

registerMenu('tile', (t, api) => {
  const groups = t.docs.some((d) => d.doc.kind === 'group');
  const locked = allDocs(t, (d) => d.locked === true);
  const pictures = allDocs(t, (d) => d.kind !== 'group');
  const ground = allDocs(t, (d) => d.background === true);
  return [
    { label: 'Group', run: () => api.tiles.group() },
    groups && { label: 'Ungroup', run: () => api.tiles.ungroup() },
    ...Z_ORDER.map(({ label, how }) => ({ label, run: () => api.tiles.reorder(how) })),
    { label: locked ? 'Unlock' : 'Lock', run: () => api.tiles.toggleLock() },
    pictures && {
      label: ground ? 'Make it an object' : 'Make it ground',
      run: () => api.editor.editSelection({ background: ground ? null : true }),
    },
    showTileEntry(t, api),
    fitGridEntry(t, api),
    shuffleEntry(t, api),
  ];
});

/** A picture that repeats across its tile gets a new shift, size and turn (Unlimited Terrain's randomise). */
function shuffleEntry(t: MenuTarget, api: MenuApi): Entry {
  const repeat = t.docs.length === 1 ? (t.docs[0]!.doc.repeat as TileRepeat | undefined) : undefined;
  return (
    !!repeat && {
      label: 'Shuffle the pattern',
      run: () => api.editor.editSelection({ repeat: shuffledRepeat(repeat) }),
    }
  );
}

/** Squares of 20 px or more, the two ways within 2% of each other. */
const MIN_SQUARE = 20;
const SAME_SQUARE = 0.02;

/**
 * The square size a map picture was drawn at, when its file name gives its
 * size in squares the way map makers name them ("Tavern_30x20.webp",
 * "cave [24x18].jpg") and `w` by `h` pixels fits that many squares both ways.
 */
export function gridOfPicture(src: string, w: number, h: number): number | undefined {
  const name = src.split('/').at(-1) ?? '';
  for (const m of name.matchAll(/(?<!\d)(\d{1,3})x(\d{1,3})(?!\d)/gi)) {
    const [across, down] = [w / Number(m[1]), h / Number(m[2])];
    if (across >= MIN_SQUARE && Math.abs(across - down) <= across * SAME_SQUARE) return Math.round(across);
  }
  return undefined;
}

/** GM: a map picture whose name gives its size in squares sets the scene's grid to fit it. */
function fitGridEntry(t: MenuTarget, api: MenuApi): Entry {
  const d = t.docs.length === 1 ? t.docs[0]!.doc : undefined;
  const size = d && typeof d.src === 'string' ? gridOfPicture(d.src, Number(d.w), Number(d.h)) : undefined;
  return api.isGm() && !!size && { label: 'Match the grid to this map', run: () => api.scenes.fitGrid(size) };
}

/** GM: show one picture tile to the players. */
function showTileEntry(t: MenuTarget, api: MenuApi): Entry {
  const src = t.docs.length === 1 ? t.docs[0]!.doc.src : undefined;
  return api.isGm() && typeof src === 'string' && { label: 'Show to players', run: () => api.journal.showImage(src) };
}

const ITEM_TYPES = ['drawing', 'note', 'template', 'region', 'sound'];

/** The GM hides map things from players, or reveals them. */
for (const type of ITEM_TYPES)
  registerMenu(type, (t, api) => {
    if (!api.isGm()) return [];
    const hidden = allDocs(t, (d) => d.hidden === true);
    return [
      {
        label: hidden ? 'Reveal to players' : 'Hide from players',
        run: () => api.editor.editSelection({ hidden: hidden ? null : true }, hidden ? 'reveal' : 'hide'),
      },
    ];
  });

registerMenu('note', (t, api) => {
  const note = t.docs.length === 1 ? t.docs[0]!.doc : undefined;
  const entry = typeof note?.entry === 'string' ? note.entry : undefined;
  const table = typeof note?.table === 'string' ? note.table : undefined;
  if (table) {
    return [
      { label: 'Roll on the table', run: () => api.journal.rollTable(table) },
      api.isGm() && { label: 'Roll for the GM alone', run: () => api.journal.rollTable(table, true) },
    ];
  }
  if (!entry) return [];
  const page = typeof note?.page === 'string' ? note.page : undefined;
  return [
    { label: 'Open journal entry', run: () => api.journal.open(entry, page) },
    api.isGm() && { label: 'Show to players', run: () => api.journal.show(entry, page) },
  ];
});

registerMenu('region', (t, api) => {
  const off = allDocs(t, (d) => d.disabled === true);
  const shown = allDocs(t, (d) => d.visible === true);
  return [
    { label: off ? 'Turn on' : 'Turn off', run: () => api.editor.editSelection({ disabled: off ? null : true }) },
    {
      label: shown ? 'Hide its outline' : 'Show its outline',
      run: () => api.editor.editSelection({ visible: shown ? null : true }),
    },
  ];
});

/** Modes where players paste what they copied. */
const PLAYER_PASTE = new Set(['drawings', 'templates']);

registerMenu('ground', (t, api) => {
  const gm = api.isGm();
  const token = t.token;
  const { label: _l, ...light } = LIGHT_PRESETS[api.editor.lightPreset];
  return [
    (gm || PLAYER_PASTE.has(t.mode)) && { label: 'Paste here', run: () => api.edits.paste() },
    gm &&
      t.mode === 'notes' && {
        label: 'Put a note here',
        run: () => api.draw.create({ mode: 'notes', data: { x: t.at[0], y: t.at[1] } }),
      },
    gm &&
      t.mode === 'lights' && {
        label: `Place ${LIGHT_PRESETS[api.editor.lightPreset].label.toLowerCase()} here`,
        run: () => api.requests.editMap({ op: 'addLight', light: { ...light, x: t.at[0], y: t.at[1] } }),
      },
    !!t.under && targetEntry(t.under.id, api),
    t.mode === 'tokens' &&
      !!token && { label: `Move ${token.name} here`, run: () => api.requests.move(token.id, t.at) },
    { label: 'Select all', run: () => api.editor.selectAll() },
  ];
});
