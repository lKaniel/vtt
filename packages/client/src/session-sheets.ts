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
  canEdit(id: string): boolean;
}

/** The open character sheet; `edit` is edit mode (the GM's, or a trusted owner's). */
export class Sheets implements SessionPart {
  current?: SheetTarget & { edit: boolean };

  constructor(
    private readonly s: SheetHost,
    private readonly on: { changed(): void },
  ) {}

  /** Opens a sheet (or closes it with undefined); only those who may edit it can open it for editing. */
  open(target: SheetTarget | undefined, edit = false): void {
    const editable = target && (target.kind === 'actor' ? this.s.isGm() : this.s.canEdit(target.id));
    this.current = target && { ...target, edit: edit && !!editable };
    this.on.changed();
  }

  setEdit(edit: boolean): void {
    if (this.current) this.open(this.current, edit);
  }

  /** After a welcome: a new role may take edit mode away (or the creature out of sight). */
  reopen(): void {
    const sheet = this.current;
    if (!sheet) return;
    const there = sheet.kind === 'token' ? this.s.tokens.has(sheet.id) : this.s.actors.has(sheet.id);
    this.open(there ? sheet : undefined, sheet.edit);
  }

  /** Closes the sheet of a creature that is gone. */
  close(kind: SheetTarget['kind'], id: string): void {
    if (this.current?.kind === kind && this.current.id === id) this.current = undefined;
  }

  gone(id: string): void {
    this.close('token', id);
  }
}
