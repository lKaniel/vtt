import { describe, expect, it } from 'vitest';
import { pageText } from './journal-text.ts';

describe('journal page text', () => {
  it('keeps plain text and Markdown as it is', () => {
    expect(pageText('The *old* well.\n\nIt is deep.')).toBe('The *old* well.\n\nIt is deep.');
  });

  it('turns HTML (from Foundry) into paragraphs of plain text', () => {
    expect(pageText('<h2>The Well</h2><p>Dug &amp; <strong>deep</strong>.</p><p>Line<br>two</p>')).toBe(
      'The Well\n\nDug & **deep**.\n\nLine\ntwo',
    );
  });
});
