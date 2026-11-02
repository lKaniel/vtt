import { uniqueId } from '@vtt/shared';
import type { Aura, Effect, EffectChange } from '@vtt/system-dnd5e';
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

/** For an effect's row: where an aura copy comes from, or what an aura reaches; nothing for the rest. */
export function auraText(e: Effect, nameOf: (token: string) => string | undefined): string | undefined {
  if (e.auraFrom) {
    const from = nameOf(e.auraFrom.split(':')[0]!);
    return from ? `aura from ${from}` : 'aura';
  }
  return e.aura && `aura ${e.aura.radius} ft, ${e.aura.who}`;
}

/** The effect with its aura changed; a radius of 0 makes it a plain effect again. */
export function setAura(e: Effect, patch: Partial<Aura>): Effect {
  const aura = { radius: 0, who: 'allies' as const, ...e.aura, ...patch };
  const { aura: _old, ...rest } = e;
  return aura.radius > 0 ? { ...rest, aura } : rest;
}
