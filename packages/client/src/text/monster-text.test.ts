import { describe, expect, it } from 'vitest';
import { resolveCreature, srdFor, TokenSchema } from '@vtt/system-dnd5e';
import { monsterLine, rechargeText, statBlockLines } from './monster-text.ts';
import { skillRows } from './sheet-text.ts';

const book = srdFor('2014');
const dragon = book.monsters.get('adult-red-dragon')!;

describe("a stat block's lines", () => {
  it('lists its other speeds, languages, alignment and attacks per action', () => {
    expect(statBlockLines(dragon)).toEqual([
      { id: 'speeds', text: 'Climb 40 ft, fly 80 ft' },
      { id: 'languages', text: 'Common, Draconic' },
      { id: 'alignment', text: 'Chaotic evil' },
      { id: 'multiattack', text: '3' },
    ]);
  });

  it('says when a flyer hovers, and leaves out what a monster lacks', () => {
    const lines = statBlockLines({ speeds: { fly: 30, hover: true } });
    expect(lines).toEqual([{ id: 'speeds', text: 'Fly 30 ft (hover)' }]);
    expect(statBlockLines(undefined)).toEqual([]);
  });
});

describe('recharge', () => {
  it('is worded as the stat block does', () => {
    expect(rechargeText(5)).toBe('Recharge 5–6');
    expect(rechargeText(6)).toBe('Recharge 6');
  });
});

describe("a monster's skills", () => {
  it('are marked proficient and expert on the skills list', () => {
    const token = TokenSchema.parse({ id: 'd', name: 'Dragon', x: 0, y: 0, monster: 'adult-red-dragon' });
    const rows = skillRows(token, resolveCreature(token, book)!);
    expect(rows.find((r) => r.skill === 'perception')).toMatchObject({ bonus: 13, proficient: true, expert: true });
    expect(rows.find((r) => r.skill === 'stealth')).toMatchObject({ bonus: 6, proficient: true, expert: false });
  });
});

describe("a monster's line under its name", () => {
  it('names the stat block, its type and its challenge rating', () => {
    expect(monsterLine(dragon)).toBe('Adult Red Dragon · dragon · CR 17');
    expect(monsterLine(book.monsters.get('goblin'))).toBe('Goblin · humanoid · CR 1/4');
    expect(monsterLine(book.monsters.get('rat'))).toBe('Rat · beast · CR 0');
  });

  it('is nothing without a stat block', () => {
    expect(monsterLine(undefined)).toBe('');
  });
});
