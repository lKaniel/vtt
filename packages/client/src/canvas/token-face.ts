import { canControl, lookTransform, type Onlooker, type Ownership, type Player, type TokenLook } from '@vtt/shared';
import { ColorMatrixFilter, type Container, type Graphics } from 'pixi.js';
import { type FilterLook, tokenFilterLook } from './weather-look.ts';

// How a token's face is drawn from its look (shared/token-look.ts): the
// picture's scale and mirroring, its ring, and how you stand to it, which
// decides whether its name and bars show; and its colour filter.

/** The picture's scale: `fit` makes it fill its square, then the token's own scale and mirroring. */
export function faceScale(look: TokenLook, fit: number): { x: number; y: number } {
  const t = lookTransform(look);
  return { x: t.x * fit, y: t.y * fit };
}

interface Looking {
  you?: Player;
  editor: { isSelected(id: string): boolean };
}

/** Whether you own the token (the GM owns them all), have it selected, and point at it. */
export function onlookerOf(s: Looking, token: { id: string; ownership?: Ownership }, hovered: boolean): Onlooker {
  return { owner: !!s.you && canControl(token, s.you), controlled: s.editor.isSelected(token.id), hovered };
}

/** A token ring: a band of its colour round the picture. */
export function drawTokenRing(g: Graphics, r: number, ring: NonNullable<TokenLook['ring']>, fallback: string): void {
  g.circle(0, 0, r - r * 0.06).stroke({ width: r * 0.12, color: ring.color ?? fallback });
}

/** One shared filter per kind of token filter. */
const filters = new Map<FilterLook, ColorMatrixFilter>();

function filterFor(look: FilterLook): ColorMatrixFilter {
  const known = filters.get(look);
  if (known) return known;
  const cm = new ColorMatrixFilter();
  if (look.matrix === 'brightness') cm.brightness(look.amount ?? 1, false);
  else cm[look.matrix](false);
  filters.set(look, cm);
  return cm;
}

/** Puts a token's colour filter (grey, sepia, ghost...) on its picture, or takes it off. */
export function applyTokenFilter(face: Container, filter: TokenLook['filter']): void {
  const look = tokenFilterLook(filter);
  face.filters = look ? [filterFor(look)] : [];
  face.alpha = look?.alpha ?? 1;
}
