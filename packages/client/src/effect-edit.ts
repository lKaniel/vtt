import { uniqueId } from '@vtt/shared';
import type { Effect, EffectChange } from '@vtt/system-dnd5e';
import type { Draft } from './ui/sheet-model.ts';

// Effects made or changed by hand on a sheet (the GM's, or a trusted
// player's): a list on the draft, saved with the rest of the sheet.

const listed = (d: Draft, effects: Effect[]): Draft => ({ ...d, effects: effects.length ? effects : undefined });

/** A blank effect added to the sheet, and its id to open it. */
export function newEffect(d: Draft): { draft: Draft; id: string } {
  const effects = d.effects ?? [];
  const id = uniqueId('effect', (x) => effects.some((e) => e.id === x));
  return { draft: listed(d, [...effects, { id, name: 'New effect', changes: [] }]), id };
}

/** The sheet with `effect` in place of the one with its id. */
export function setEffect(d: Draft, effect: Effect): Draft {
  return listed(
    d,
    (d.effects ?? []).map((e) => (e.id === effect.id ? effect : e)),
  );
}

export function removeEffect(d: Draft, id: string): Draft {
  return listed(
    d,
    (d.effects ?? []).filter((e) => e.id !== id),
  );
}

/** What a new change row starts as. */
export const blankChange = (): EffectChange => ({ key: 'ac', mode: 'add', value: 1 });
