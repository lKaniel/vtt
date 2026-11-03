import type { Creature, TokenView } from '@vtt/system-dnd5e';
import type { Session } from '../../session/session.ts';
import type { SheetTarget } from '../../session/session-sheets.ts';
import { activateTile } from '../../play/tile-use.ts';
import { tileFor } from '../../play/hotbar.ts';
import type { Draft, Update } from '../sheet-model.ts';

/** Everything a part of the sheet needs. */
export interface SheetProps {
  session: Session;
  kind: SheetTarget['kind'];
  value: Draft;
  update: Update;
  sheet: Creature;
  edit: boolean;
}

/** May the viewer act with this creature from its sheet: roll its checks, use its gear (a token they control)? */
export function canAct({ session, kind, value, edit }: Readonly<SheetProps>): boolean {
  return kind === 'token' && !edit && session.canControl(value as TokenView);
}

/**
 * Uses an attack, spell, feature or item from the sheet as its action bar
 * tile would: the creature is selected, then the attack readied or the
 * spell aimed.
 */
export function actFromSheet({ session, value }: Readonly<SheetProps>, ref: string): void {
  const token = session.tokens.get(value.id);
  const tile = token && tileFor(token, ref);
  if (!token || !tile) return;
  session.select(token.id);
  activateTile(session, token, tile);
}
