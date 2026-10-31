import type { Point } from '@vtt/shared';

// Walking with the arrow keys: one square per press.

const STEPS: Record<string, Point> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

/** Where an arrow key sends a token, or undefined for any other key. */
export function stepTarget(token: { x: number; y: number }, key: string, gridSize: number): Point | undefined {
  const step = STEPS[key];
  return step && [token.x + step[0] * gridSize, token.y + step[1] * gridSize];
}
