import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { lastingEffects, zonePlacements, zonesOf } from './zones.ts';
import { TokenSchema } from './token-schema.ts';
import type { Edition } from './stats-schema.ts';

// Lasting areas that make the ground hard going: a difficult-ground region
// the size of the area, kept while the spell lasts.

const druid = TokenSchema.parse({ id: 'dru', name: 'Druid', x: 50, y: 50 });
const ground = (id: string, edition: Edition = '2014', at: [number, number] = [550, 550]) => {
  const spell = srdFor(edition).spells.get(id)!;
  const bearer = { ...druid, effects: lastingEffects(druid, spell, spell.level, at) };
  const [zone] = zonesOf([bearer]);
  return zonePlacements(zone!, spell, 100).region;
};

describe('difficult ground from spells', () => {
  it('spike growth: a 20-ft circle where moving costs double', () => {
    const region = ground('spike-growth')!;
    expect(region.behaviors).toEqual([{ type: 'difficult', multiplier: 2 }]);
    const far = Math.max(...region.points.map(([x, y]) => Math.hypot(x - 550, y - 550)));
    expect(far).toBeCloseTo(400, 0);
  });

  it('web: a 20-ft cube', () => {
    const xs = ground('web')!.points.map(([x]) => x);
    expect(Math.max(...xs) - Math.min(...xs)).toBe(400);
  });

  it.each(['2014', '2024'] as const)('%s plant growth: overgrowth costs 4 ft for every foot', (edition) => {
    expect(ground('plant-growth', edition)?.behaviors).toEqual([{ type: 'difficult', multiplier: 4 }]);
  });
});
