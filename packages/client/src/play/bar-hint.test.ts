import type { TokenView } from '@vtt/system-dnd5e';
import { describe, expect, it } from 'vitest';
import type { Session } from '../session/session.ts';
import { barHint, IDLE_HINT, phoneHint } from './bar-hint.ts';

interface Actions { armed?: string; aiming?: { mode?: string; spell: { name: string }; need: number; picks: unknown[] } }
const at = (actions: Actions) => ({ actions }) as unknown as Session;
const token = { id: 'orrin' } as TokenView;
const missile = { spell: { name: 'Magic Missile' }, need: 3, picks: [1] };
const fireball = { mode: 'point', spell: { name: 'Fireball' }, need: 1, picks: [] };

describe('the hint over the action bar', () => {
  it('asks a mouse to click, and tells how to cancel', () => {
    expect(barHint(at({ armed: 'Longsword' }), token)).toBe(
      'Click a target for Longsword · right click or Esc to cancel',
    );
    expect(barHint(at({ aiming: fireball }), token)).toBe('Click where Fireball goes · right click or Esc to cancel');
    expect(barHint(at({ aiming: missile }), token)).toBe(
      'Click 2 more target(s) for Magic Missile · right click or Esc to cancel',
    );
    expect(barHint(at({}), token)).toBe(IDLE_HINT);
    expect(barHint(at({}), undefined)).not.toBe(IDLE_HINT);
  });

  it('asks a finger to tap, and to tap the tile again to cancel', () => {
    expect(phoneHint(at({ armed: 'Longsword' }), token)).toBe(
      'Tap a target for Longsword · tap the tile again to cancel',
    );
    expect(phoneHint(at({ aiming: fireball }), token)).toBe('Tap where Fireball goes · tap the tile again to cancel');
    expect(phoneHint(at({ aiming: missile }), token)).toBe(
      'Tap 2 more target(s) for Magic Missile · tap the tile again to cancel',
    );
    expect(phoneHint(at({}), token)).toBe(IDLE_HINT);
    expect(phoneHint(at({}), undefined)).toBe('Tap one of your characters to select them');
  });
});
