import type { SheetTarget } from './session/session-sheets.ts';

// Sheets popped out of the table into windows of their own (Foundry's pop
// out): each keeps its own edit mode, apart from the sheet open over the
// map. ui/PopOutWindow.tsx draws them.

export type PoppedSheet = SheetTarget & { edit: boolean };

const same = (a: SheetTarget, b: SheetTarget) => a.kind === b.kind && a.id === b.id;

export class Popouts {
  list: readonly PoppedSheet[] = [];
  private listeners = new Set<() => void>();

  /** For useSyncExternalStore: call `fn` on every change; returns the unsubscribe. */
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  /** Pops a sheet out (once: a sheet already out stays as it is). */
  open(target: SheetTarget, edit = false): void {
    if (this.list.some((s) => same(s, target))) return;
    this.set([...this.list, { kind: target.kind, id: target.id, edit }]);
  }

  setEdit(target: SheetTarget, edit: boolean): void {
    this.set(this.list.map((s) => (same(s, target) ? { ...s, edit } : s)));
  }

  close(target: SheetTarget): void {
    this.set(this.list.filter((s) => !same(s, target)));
  }

  private set(list: readonly PoppedSheet[]): void {
    this.list = list;
    for (const fn of this.listeners) fn();
  }
}

/** The window.open features of a popped-out sheet. */
export const popoutFeatures = (): string => 'popup,width=1040,height=780';
