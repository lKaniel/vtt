import { canControl, lookTransform, type Onlooker, type Ownership, type Player, type TokenLook } from '@vtt/shared';
import type { Graphics } from 'pixi.js';

// How a token's face is drawn from its look (shared/token-look.ts): the
// picture's scale and mirroring, its ring, and how you stand to it, which
// decides whether its name and bars show.

/** The picture's scale: `fit` makes it fill its square, then the token's own scale and mirroring. */
export function faceScale(look: TokenLook, fit: number): { x: number; y: number } {
  const t = lookTransform(look);
  return { x: t.x * fit, y: t.y * fit };
}

interface Looking {
  you?: Player;
  isSelected: (id: string) => boolean;
}

/** Whether you own the token (the GM owns them all), have it selected, and point at it. */
export function onlookerOf(s: Looking, token: { id: string; ownership?: Ownership }, hovered: boolean): Onlooker {
  return { owner: !!s.you && canControl(token, s.you), controlled: s.isSelected(token.id), hovered };
}

/** A token ring: a band of its colour round the picture. */
export function drawTokenRing(g: Graphics, r: number, ring: NonNullable<TokenLook['ring']>, fallback: string): void {
  g.circle(0, 0, r - r * 0.06).stroke({ width: r * 0.12, color: ring.color ?? fallback });
}
