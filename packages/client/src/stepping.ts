import type { Point } from '@vtt/shared';

// Walking with the arrow keys (or the keys bound to the step actions, see
// keybinds.ts): one square per press.

const STEPS: Record<string, Point> = {
  'step-up': [0, -1],
  'step-down': [0, 1],
  'step-left': [-1, 0],
  'step-right': [1, 0],
};

export const STEP_ACTIONS = Object.keys(STEPS);

/** Where a step action sends a token, or undefined for any other action. */
export function stepTarget(token: { x: number; y: number }, key: string, gridSize: number): Point | undefined {
  const step = STEPS[key];
  return step && [token.x + step[0] * gridSize, token.y + step[1] * gridSize];
}
