// The table's single keys, which each player may change for this browser
// (the Keybindings screen, ui/KeysDialog.tsx). Keys with Ctrl (undo, copy,
// the layer keys in edit-keys.ts) and Esc stay as they are.

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

export interface KeyAction {
  id: string;
  label: string;
  group: 'Table' | 'Action bar' | 'Map tools' | 'Walking';
  /** The default key, as comboOf names it. */
  key: string;
  /** Actions it shares its key with on purpose (they never apply at once). */
  shares?: string[];
}

const HOTBAR = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

export const KEY_ACTIONS: readonly KeyAction[] = [
  { id: 'sheet', label: 'Open or close the sheet', group: 'Table', key: 'c' },
  { id: 'editSheet', label: 'Edit the sheet', group: 'Table', key: 'e' },
  { id: 'endTurn', label: 'End your turn', group: 'Table', key: 'space' },
  { id: 'target', label: 'Target the token under the pointer', group: 'Table', key: 't', shares: ['mode-tokens'] },
  ...HOTBAR.map((k, i): KeyAction => ({ id: `hotbar-${k}`, label: `Slot ${i + 1}`, group: 'Action bar', key: k })),
  { id: 'mode-tokens', label: 'Tokens', group: 'Map tools', key: 't', shares: ['target'] },
  { id: 'mode-tiles', label: 'Tiles', group: 'Map tools', key: 'shift+t' },
  { id: 'mode-walls', label: 'Walls', group: 'Map tools', key: 'w' },
  { id: 'mode-lights', label: 'Lights', group: 'Map tools', key: 'l' },
  { id: 'mode-drawings', label: 'Drawings', group: 'Map tools', key: 'd' },
  { id: 'mode-notes', label: 'Notes', group: 'Map tools', key: 'n' },
  { id: 'mode-templates', label: 'Templates', group: 'Map tools', key: 'm' },
  { id: 'mode-ruler', label: 'Ruler', group: 'Map tools', key: 'r' },
  { id: 'step-up', label: 'Step up', group: 'Walking', key: 'arrowup' },
  { id: 'step-down', label: 'Step down', group: 'Walking', key: 'arrowdown' },
  { id: 'step-left', label: 'Step left', group: 'Walking', key: 'arrowleft' },
  { id: 'step-right', label: 'Step right', group: 'Walking', key: 'arrowright' },
];

/** The player's own keys, by action id; the rest keep their default. */
export type Keymap = Record<string, string>;

interface Press {
  key: string;
  shiftKey: boolean;
}

/** A key press as bindings name it: "c", "shift+t", "space", "arrowup". */
export function comboOf(e: Press): string {
  const key = e.key === ' ' ? 'space' : e.key.toLowerCase();
  return e.shiftKey && key !== 'shift' ? `shift+${key}` : key;
}

const ARROWS: Record<string, string> = { arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→' };

/** "shift+t" as the screen shows it: "Shift+T". */
export function keyLabel(combo: string): string {
  return combo
    .split('+')
    .map((part) => ARROWS[part] ?? (part.length === 1 ? part.toUpperCase() : part[0]!.toUpperCase() + part.slice(1)))
    .join('+');
}

export function keyOf(id: string, map: Keymap): string | undefined {
  return map[id] ?? KEY_ACTIONS.find((a) => a.id === id)?.key;
}

function bound(combo: string, map: Keymap, ids?: readonly string[]): string | undefined {
  return KEY_ACTIONS.find((a) => (!ids || ids.includes(a.id)) && keyOf(a.id, map) === combo)?.id;
}

/** The action a key press asks for, among `ids` (default: all); Shift+key falls back to the key. */
export function actionOf(e: Press, map: Keymap, ids?: readonly string[]): string | undefined {
  const exact = bound(comboOf(e), map, ids);
  return exact ?? (e.shiftKey ? bound(comboOf({ key: e.key, shiftKey: false }), map, ids) : undefined);
}

/** Keys bound to more than one action that may clash: key → action ids. */
export function conflicts(map: Keymap): Map<string, string[]> {
  const byKey = new Map<string, string[]>();
  for (const a of KEY_ACTIONS) {
    const key = keyOf(a.id, map)!;
    byKey.set(key, [...(byKey.get(key) ?? []), a.id]);
  }
  const shared = (ids: string[]) =>
    ids.every((id) => ids.every((o) => o === id || KEY_ACTIONS.find((a) => a.id === id)?.shares?.includes(o)));
  return new Map([...byKey].filter(([, ids]) => ids.length > 1 && !shared(ids)));
}

const STORE_KEY = 'vtt:keys';

let current: Keymap | undefined;

/** This browser's keys, read once. */
export function currentKeys(): Keymap {
  current ??= loadKeymap();
  return current;
}

/** Changes this browser's keys and keeps them. */
export function setKeys(map: Keymap): void {
  current = map;
  saveKeymap(map);
}

function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function loadKeymap(storage: Storage | undefined = browserStorage()): Keymap {
  try {
    const parsed = JSON.parse(storage?.getItem(STORE_KEY) ?? '{}') as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Keymap) : {};
  } catch {
    return {};
  }
}

export function saveKeymap(map: Keymap, storage: Storage | undefined = browserStorage()): void {
  try {
    storage?.setItem(STORE_KEY, JSON.stringify(map));
  } catch {
    // Not kept: the keys still hold until the page reloads.
  }
}
