// Journal page text: our own pages are plain text with a little Markdown
// (see rich-text.ts); pages brought from Foundry are HTML, shown as the same
// paragraphs, bold kept, every other tag dropped.

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

/** The text of a page, as paragraphs separated by blank lines. */
export function pageText(text: string): string {
  if (!/<[a-z][^>]*>/i.test(text)) return text;
  return text
    .replace(/<\/?(strong|b)>/gi, '**')
    .replace(/<\/?(em|i)>/gi, '*')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h[1-6]|li|div|blockquote)>/gi, '\n\n')
    .replace(/<[^<>]*>/g, '')
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e] ?? e)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
