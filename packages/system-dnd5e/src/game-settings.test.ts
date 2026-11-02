import { describe, expect, it } from 'vitest';
import { rollCheck } from './checks.ts';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { saveModifiers } from './effects.ts';
import { encumbrance } from './carrying.ts';
import { gameSettingsOf, withSettings } from './game-settings.ts';
import { TokenSchema } from './token-schema.ts';

// The GM's options for the whole game (game.json `settings`): which
// encumbrance rule the table plays.

const book = srdFor('2014');
const variant = withSettings(book, { encumbrance: 'variant' });
const off = withSettings(book, { encumbrance: 'off' });
// Strength 10: encumbered over 50 lb, heavily over 100, over capacity past 150.
const carrying = (qty: number) =>
  TokenSchema.parse({
    id: 't',
    name: 'T',
    x: 50,
    y: 50,
    stats: { abilities: { str: 10 } },
    inventory: [{ item: 'plate', qty }],
  });

describe('game settings', () => {
  it('fill in the defaults and drop what the system does not know', () => {
    expect(gameSettingsOf(undefined)).toEqual({ encumbrance: 'capacity' });
    expect(gameSettingsOf({ encumbrance: 'variant' })).toEqual({ encumbrance: 'variant' });
    expect(gameSettingsOf({ encumbrance: 'heavy' })).toEqual({ encumbrance: 'capacity' });
  });
});

describe('variant encumbrance', () => {
  it('slows a creature by 10 ft over five times its Strength', () => {
    expect(resolveCreature(carrying(1), book)?.speed).toBe(30);
    expect(resolveCreature(carrying(1), variant)?.speed).toBe(20);
    expect(encumbrance(carrying(1), 10, variant)).toMatchObject({ level: 'encumbered' });
  });

  it('slows it by 20 ft over ten times, with disadvantage on Str, Dex and Con rolls', () => {
    const sheet = resolveCreature(carrying(2), variant)!;
    expect(sheet.speed).toBe(10);
    expect(encumbrance(carrying(2), 10, variant)).toMatchObject({ level: 'heavy' });
    expect(saveModifiers(sheet, 'dex').disadvantage).toBe(true);
    expect(saveModifiers(sheet, 'wis').disadvantage).toBe(false);
    const rolls: number[] = [];
    rollCheck({}, sheet, { ability: 'str' }, () => (rolls.push(1), 0.5));
    expect(rolls).toHaveLength(2);
    rolls.length = 0;
    rollCheck({}, sheet, { ability: 'int' }, () => (rolls.push(1), 0.5));
    expect(rolls).toHaveLength(1);
  });

  it('still drops speed to 5 ft over capacity', () => {
    expect(resolveCreature(carrying(3), variant)?.speed).toBe(5);
  });

  it('is not counted at all when the GM turns encumbrance off', () => {
    expect(resolveCreature(carrying(3), off)?.speed).toBe(30);
    expect(encumbrance(carrying(3), 10, off)).toMatchObject({ over: false, level: 'none' });
  });
});
