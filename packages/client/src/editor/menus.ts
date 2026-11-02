import type { Doc, DocRef, Patch } from '@vtt/core';
import { type EditorMode, type MapEdit, type Point, type WallRules, wallPreset, type ZOrder } from '@vtt/shared';
import type { TokenView } from '@vtt/system-dnd5e';
import { LIGHT_PRESETS, type LightPreset } from '../map-tools.ts';
import type { Draft } from './shape-tools.ts';
import { presetPatch } from './wall-fields.ts';

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
  /** Copy, cut and delete may work on the selection (the GM's, or a player's own drawings). */
  canEditSelection(): boolean;
  createItem(draft: Draft): void;
  openJournal(entry: string, page?: string): void;
  showJournal(entry: string, page?: string): void;
  copy(): string | undefined;
  cut(): string | undefined;
  paste(): void;
  duplicate(): void;
  deleteSelected(): void;
  editSelection(patch: Patch, label?: string): void;
  selectAll(): void;
  setSelection(keys: string[]): void;
  openSheet(target: { kind: 'token'; id: string }, edit?: boolean): void;
  move(token: string, to: Point): void;
  editMap(edit: MapEdit): void;
  group(): void;
  ungroup(): void;
  reorder(how: ZOrder): void;
  toggleLock(): void;
  readonly lightPreset: LightPreset;
  /** The creatures you target (see targets.ts). */
  readonly targets: { readonly mine: ReadonlySet<string>; toggle(id: string): void };
  /** Opens the token HUD beside a creature (see session-hud.ts). */
  openHud(token: string, screen: Point): void;
  /** GM: the creature whose eyes the map shows. */
  readonly observing?: string;
  observe(token: string | undefined): void;
  /** GM: opens a picture on every player's screen. */
  showImage(src: string, title?: string): void;
  /** Opens a pile of loot's or a merchant's window (see session-piles.ts). */
  openPile(token: string): void;
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
  if (!type) return run('ground', target, api);
  return [...run(type, target, api), ...run('selection', target, api)];
}

// Built-in entries ---------------------------------------------------------------

/** Puts a copy on the system clipboard too, so Ctrl+V and other tabs paste it. */
function toClipboard(text: string | undefined): void {
  if (text) navigator.clipboard.writeText(text).catch(() => undefined);
}

const allDocs = (t: MenuTarget, test: (doc: Doc) => boolean): boolean => t.docs.every((d) => test(d.doc));

registerMenu('selection', (_t, api) =>
  api.canEditSelection()
    ? [
        { label: 'Copy', run: () => toClipboard(api.copy()) },
        { label: 'Cut', run: () => toClipboard(api.cut()) },
        { label: 'Duplicate', run: () => api.duplicate() },
        { label: 'Delete', run: () => api.deleteSelected(), danger: true },
      ]
    : [],
);

registerMenu('token', (t, api) => {
  const id = t.token?.id;
  if (!id) return [];
  const hidden = allDocs(t, (d) => d.hidden === true);
  return [
    openEntry(t.token, id, api),
    hudEntry(id, t.screen, api),
    api.canEdit(id) && { label: 'Edit sheet', run: () => api.openSheet({ kind: 'token', id }, true) },
    api.isGm() && {
      label: hidden ? 'Reveal to players' : 'Hide from players',
      run: () => api.editSelection({ hidden: hidden ? null : true }, hidden ? 'reveal' : 'hide'),
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
    ? { label: `Open ${token.name}`, run: () => api.openPile(id) }
    : { label: 'Open sheet', run: () => api.openSheet({ kind: 'token', id }) };

/** GM: makes a token a pile of loot or a merchant (see system-dnd5e piles.ts), locks it, or makes it a token again. */
function pileEntries(pile: TokenView['pile'], api: MenuApi): MenuItem[] {
  const set = (to: Partial<NonNullable<TokenView['pile']>> | null, label: string) => () =>
    api.editSelection({ pile: to }, label);
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
  api.observing === id
    ? { label: 'Stop seeing through its eyes', run: () => api.observe(undefined) }
    : { label: 'See through its eyes', run: () => api.observe(id) };

const hudEntry = (id: string, screen: Point | undefined, api: MenuApi): Entry =>
  !!screen && { label: 'Token HUD', run: () => api.openHud(id, screen) };

/** GM: show a creature's picture to the players. */
function artEntry(token: TokenView | undefined, api: MenuApi): Entry {
  const src = token?.img ?? token?.art;
  return api.isGm() && !!src && { label: 'Show art to players', run: () => api.showImage(src, token?.name) };
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
    run: () => api.editSelection(k.patch),
  }));
  if (!allDocs(t, (d) => !!d.door)) return kinds;
  const locked = allDocs(t, (d) => d.door === 'locked');
  const open = allDocs(t, (d) => d.door === 'open');
  return [
    ...kinds,
    { label: open ? 'Close' : 'Open', run: () => api.editSelection({ door: open ? 'closed' : 'open' }) },
    { label: locked ? 'Unlock' : 'Lock', run: () => api.editSelection({ door: locked ? 'closed' : 'locked' }) },
  ];
});

registerMenu('light', (t, api) => {
  const steady = allDocs(t, (d) => !d.animation);
  const dark = allDocs(t, (d) => d.darkness === true);
  return [
    {
      label: steady ? 'Flicker' : 'Hold steady',
      run: () => api.editSelection({ animation: steady ? 'flicker' : null }),
    },
    {
      label: dark ? 'Make it light' : 'Make it magical darkness',
      run: () => api.editSelection({ darkness: dark ? null : true }),
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
    { label: 'Group', run: () => api.group() },
    groups && { label: 'Ungroup', run: () => api.ungroup() },
    ...Z_ORDER.map(({ label, how }) => ({ label, run: () => api.reorder(how) })),
    { label: locked ? 'Unlock' : 'Lock', run: () => api.toggleLock() },
    pictures && {
      label: ground ? 'Make it an object' : 'Make it ground',
      run: () => api.editSelection({ background: ground ? null : true }),
    },
    showTileEntry(t, api),
  ];
});

/** GM: show one picture tile to the players. */
function showTileEntry(t: MenuTarget, api: MenuApi): Entry {
  const src = t.docs.length === 1 ? t.docs[0]!.doc.src : undefined;
  return api.isGm() && typeof src === 'string' && { label: 'Show to players', run: () => api.showImage(src) };
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
        run: () => api.editSelection({ hidden: hidden ? null : true }, hidden ? 'reveal' : 'hide'),
      },
    ];
  });

registerMenu('note', (t, api) => {
  const note = t.docs.length === 1 ? t.docs[0]!.doc : undefined;
  const entry = typeof note?.entry === 'string' ? note.entry : undefined;
  if (!entry) return [];
  const page = typeof note?.page === 'string' ? note.page : undefined;
  return [
    { label: 'Open journal entry', run: () => api.openJournal(entry, page) },
    api.isGm() && { label: 'Show to players', run: () => api.showJournal(entry, page) },
  ];
});

registerMenu('region', (t, api) => {
  const off = allDocs(t, (d) => d.disabled === true);
  const shown = allDocs(t, (d) => d.visible === true);
  return [
    { label: off ? 'Turn on' : 'Turn off', run: () => api.editSelection({ disabled: off ? null : true }) },
    {
      label: shown ? 'Hide its outline' : 'Show its outline',
      run: () => api.editSelection({ visible: shown ? null : true }),
    },
  ];
});

/** Modes where players paste what they copied. */
const PLAYER_PASTE = new Set(['drawings', 'templates']);

registerMenu('ground', (t, api) => {
  const gm = api.isGm();
  const token = t.token;
  const { label: _l, ...light } = LIGHT_PRESETS[api.lightPreset];
  return [
    (gm || PLAYER_PASTE.has(t.mode)) && { label: 'Paste here', run: () => api.paste() },
    gm &&
      t.mode === 'notes' && {
        label: 'Put a note here',
        run: () => api.createItem({ mode: 'notes', data: { x: t.at[0], y: t.at[1] } }),
      },
    gm &&
      t.mode === 'lights' && {
        label: `Place ${LIGHT_PRESETS[api.lightPreset].label.toLowerCase()} here`,
        run: () => api.editMap({ op: 'addLight', light: { ...light, x: t.at[0], y: t.at[1] } }),
      },
    !!t.under && targetEntry(t.under.id, api),
    t.mode === 'tokens' && !!token && { label: `Move ${token.name} here`, run: () => api.move(token.id, t.at) },
    { label: 'Select all', run: () => api.selectAll() },
  ];
});
