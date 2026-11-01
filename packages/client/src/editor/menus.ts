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
    { label: 'Open sheet', run: () => api.openSheet({ kind: 'token', id }) },
    api.canEdit(id) && { label: 'Edit sheet', run: () => api.openSheet({ kind: 'token', id }, true) },
    api.isGm() && {
      label: hidden ? 'Reveal to players' : 'Hide from players',
      run: () => api.editSelection({ hidden: hidden ? null : true }, hidden ? 'reveal' : 'hide'),
    },
  ];
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
  ];
});

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
    t.mode === 'tokens' && !!token && { label: `Move ${token.name} here`, run: () => api.move(token.id, t.at) },
    { label: 'Select all', run: () => api.selectAll() },
  ];
});
