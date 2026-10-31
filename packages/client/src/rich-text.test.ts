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
});
