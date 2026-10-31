// SRD descriptions use a little Markdown: paragraphs, *italic*, **bold**
// and ***both***. This turns them into spans React can render safely.

export interface Span {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

const MARKS = /(\*{1,3})([^*]+)\1/g;

function spans(paragraph: string): Span[] {
  const out: Span[] = [];
  let last = 0;
  for (const m of paragraph.matchAll(MARKS)) {
    if (m.index > last) out.push({ text: paragraph.slice(last, m.index) });
    const stars = m[1]!.length;
    out.push({ text: m[2]!, ...(stars >= 2 ? { bold: true } : {}), ...(stars !== 2 ? { italic: true } : {}) });
    last = m.index + m[0].length;
  }
  if (last < paragraph.length) out.push({ text: paragraph.slice(last) });
  return out;
}

export function parseRich(text: string): Span[][] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(spans);
}
