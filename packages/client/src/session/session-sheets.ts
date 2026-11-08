import type { Actor, TokenView } from '@vtt/system-dnd5e';
import type { SessionPart } from './session-part.ts';

/** What a character sheet shows: a token on the map or (GM only) an actor in the list. */
export interface SheetTarget {
  kind: 'token' | 'actor';
  id: string;
}

/** What the open sheet needs of the session. */
export interface SheetHost {
  readonly tokens: ReadonlyMap<string, TokenView>;
  readonly actors: ReadonlyMap<string, Actor>;
  isGm(): boolean;
  canEdit(id: string, kind?: 'token' | 'actor'): boolean;
}

export type OpenSheet = SheetTarget & { edit: boolean };

const same = (a: SheetTarget, b: SheetTarget) => a.kind === b.kind && a.id === b.id;

/**
 * The open character sheets, several at once as in Foundry; the last
 * opened is in front (`current`). `edit` is edit mode (the GM's, or a
 * owner's).
 */
export class Sheets implements SessionPart {
  list: readonly OpenSheet[] = [];

  constructor(
    private readonly s: SheetHost,
    private readonly on: { changed(): void },
  ) {}

  /** The sheet in front: the last one opened. */
  get current(): OpenSheet | undefined {
    return this.list.at(-1);
  }

  isOpen(target: SheetTarget): boolean {
    return this.list.some((o) => same(o, target));
  }

  /**
   * Opens a sheet in front (one already open moves there), or with undefined
   * closes the front one; only those who may edit it can open it for editing.
   */
  open(target: SheetTarget | undefined, edit = false): void {
    if (!target) return this.set(this.list.slice(0, -1));
    const editable = this.editable(target);
    const sheet = { kind: target.kind, id: target.id, edit: edit && editable };
    this.set([...this.list.filter((o) => !same(o, target)), sheet]);
  }

  private editable(target: SheetTarget): boolean {
    return this.s.canEdit(target.id, target.kind);
  }

  /** Closes one sheet; the others stay. */
  shut(target: SheetTarget): void {
    this.set(this.list.filter((o) => !same(o, target)));
  }

  /** Edit mode on or off for `target` (the front sheet when unset), in place. */
  setEdit(edit: boolean, target: SheetTarget | undefined = this.current): void {
    if (!target) return;
    const editable = this.editable(target);
    this.set(this.list.map((o) => (same(o, target) ? { ...o, edit: edit && editable } : o)));
  }

  /** After a welcome: a new role may take edit mode away (or the creature out of sight). */
  reopen(): void {
    const there = (o: SheetTarget) => (o.kind === 'token' ? this.s.tokens.has(o.id) : this.s.actors.has(o.id));
    const kept = this.list.filter(there);
    this.list = kept;
    for (const o of kept) this.setEdit(o.edit, o);
    if (!kept.length) this.on.changed();
  }

  /** Closes the sheet of a creature that is gone. */
  close(kind: SheetTarget['kind'], id: string): void {
    this.list = this.list.filter((o) => !same(o, { kind, id }));
  }

  gone(id: string): void {
    this.close('token', id);
  }

  private set(list: readonly OpenSheet[]): void {
    this.list = list;
    this.on.changed();
  }
}
