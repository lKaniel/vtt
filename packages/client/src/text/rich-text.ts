import { contentPieces, type CheckRef, type ContentLink, type Piece } from '../content/content-links.ts';

// SRD descriptions use a little Markdown: paragraphs, *italic*, **bold**
// and ***both***. This turns them into spans React can render safely.

export interface Span {
  text: string;
  bold?: boolean;
  italic?: boolean;
  /** A link to a document (see content-links.ts); `text` is its label, if it has one. */
  link?: ContentLink;
  /** An inline roll: the chat command it sends. */
  roll?: string;
  /** An inline check to ask for. */
  check?: CheckRef;
}

const MARKS = /(\*{1,3})([^*]+)\1/g;

function marked(paragraph: string): Span[] {
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

/** A content piece as a span: plain runs read their marks. */
function pieceSpans(piece: Piece): Span[] {
  if ('text' in piece) return marked(piece.text);
  const { label = '', ...rest } = piece;
  return [{ text: label, ...rest }];
}

const spans = (paragraph: string): Span[] => contentPieces(paragraph).flatMap(pieceSpans);

export function parseRich(text: string): Span[][] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(spans);
}
