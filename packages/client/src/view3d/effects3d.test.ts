import { describe, expect, it } from 'vitest';
import type { Cue } from '../feedback.ts';
import { type Body, Effects3D } from './effects3d.ts';

// Attacks and spells in 3D: the view plays every cue but videos, which stay
// on the flat map; attackers lunge, struck creatures shake and flash, and
// their hit point bars are let go when the blow lands.

function effects() {
  const bodies: Record<string, Body> = {
    hero: { at: [100, 100], feet: 0, size: 100 },
    orc: { at: [600, 100], feet: 0, size: 100 },
  };
  const released: string[] = [];
  const fx = new Effects3D({
    body: (id) => bodies[id],
    groundAt: () => 0,
    px: () => 20,
    released: (id) => released.push(id),
  });
  return { fx, released };
}

describe('3D attack and spell effects', () => {
  it('plays all but videos, which it leaves to the flat map', () => {
    const { fx } = effects();
    const video: Cue = { at: 0, kind: 'video', from: 'hero', to: 'orc', srcs: ['a.webm'], ranged: true };
    const arrow: Cue = {
      at: 0,
      kind: 'missile',
      from: 'hero',
      to: 'orc',
      element: 'piercing',
      style: 'arrow',
      duration: 300,
    };
    expect(fx.play([video, arrow], 0)).toEqual([video]);
    expect(fx.tick(0)).toBe(true);
    expect(fx.group.children).toHaveLength(1);
    expect(fx.tick(400)).toBe(false);
    expect(fx.group.children).toHaveLength(0);
  });

  it('steps an attacker toward its target and back', () => {
    const { fx } = effects();
    fx.play([{ at: 0, kind: 'lunge', token: 'hero', toward: 'orc' }], 0);
    fx.tick(0);
    expect(fx.offsetOf('hero', 100, 130)[0]).toBeGreaterThan(20);
    expect(fx.offsetOf('hero', 100, 1000)).toEqual([0, 0]);
  });

  it('flashes and shakes a struck creature, sparks flying, and lets its bar move', () => {
    const { fx, released } = effects();
    fx.play([{ at: 50, kind: 'impact', token: 'orc', element: 'fire' }], 0);
    fx.tick(60);
    expect(released).toEqual(['orc']);
    expect(fx.tintOf('orc', 70)).toBeDefined();
    expect(fx.tintOf('orc', 2000)).toBeUndefined();
    expect(fx.group.children).toHaveLength(1);
  });

  it('sprays a cone of fire from the caster, and a line of lightning as one bolt', () => {
    const { fx } = effects();
    fx.play(
      [
        { at: 0, kind: 'spray', from: 'hero', to: [600, 300], length: 15, wide: true, element: 'fire' },
        { at: 0, kind: 'spray', from: 'hero', to: [600, 100], length: 100, wide: false, element: 'lightning' },
        { at: 0, kind: 'spray', from: 'ghost', to: [600, 100], length: 100, wide: false, element: 'cold' },
      ],
      0,
    );
    fx.tick(10);
    expect(fx.group.children).toHaveLength(2);
    expect(fx.tick(2000)).toBe(false);
  });

  it('plays nothing for a creature this player cannot see', () => {
    const { fx } = effects();
    fx.play([{ at: 0, kind: 'burst', where: 'ghost', radius: 20, element: 'fire' }], 0);
    expect(fx.tick(0)).toBe(false);
    expect(fx.group.children).toHaveLength(0);
  });
});
