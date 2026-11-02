import { describe, expect, it } from 'vitest';
import { parseRich } from './rich-text.ts';

describe('parseRich', () => {
  it('splits paragraphs and reads bold and italic marks', () => {
    expect(parseRich('***Darkvision.*** You see.\n\nA *small* **step**.')).toEqual([
      [{ text: 'Darkvision.', bold: true, italic: true }, { text: ' You see.' }],
      [{ text: 'A ' }, { text: 'small', italic: true }, { text: ' ' }, { text: 'step', bold: true }, { text: '.' }],
    ]);
  });

  it('drops empty paragraphs', () => {
    expect(parseRich('\n\n  \n\nHi')).toEqual([[{ text: 'Hi' }]]);
  });

  it('keeps links and inline rolls as their own spans', () => {
    expect(parseRich('Roll [[1d6]]{fire} at @journal[well], *now*.')).toEqual([
      [
        { text: 'Roll ' },
        { text: 'fire', roll: '/r 1d6' },
        { text: ' at ' },
        { text: '', link: { kind: 'journal', id: 'well' } },
        { text: ', ' },
        { text: 'now', italic: true },
        { text: '.' },
      ],
    ]);
  });
});
