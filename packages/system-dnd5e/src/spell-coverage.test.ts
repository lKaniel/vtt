import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { type Token, TokenSchema } from './token-schema.ts';
import { resolveCast } from './spells.ts';
import type { Edition } from './stats-schema.ts';

// Spot checks for spells the SRD conversion left manual or got wrong, now
// automated by hand in spell-automation.json.

const spell = (id: string, edition: Edition = '2014') => srdFor(edition).spells.get(id)!;
const wizard = TokenSchema.parse({
  id: 'wiz',
  name: 'Wizard',
  x: 50,
  y: 50,
  ownership: { default: 'limited', ana: 'owner' },
  stats: { class: 'wizard', level: 9, abilities: { int: 18, dex: 14 } },
});
const goblin = (id: string, hp: number) =>
  TokenSchema.parse({ id, name: id, x: 150, y: 50, monster: 'goblin', hp, ownership: { default: 'none' } });
const side = (token: Token, edition: Edition = '2014') => ({ token, sheet: resolveCreature(token, srdFor(edition))! });
const cast = (id: string, targets: Token[], edition: Edition = '2014', rng = () => 0.5) => {
  const s = spell(id, edition);
  return resolveCast(
    {
      spell: s,
      slot: s.level,
      caster: side(wizard, edition),
      targets: targets.map((t) => side(t, edition)),
      gridSize: 100,
    },
    rng,
  ).results;
};

describe('spells automated by hand', () => {
  it('2014 color spray blinds the weakest creatures its rolled pool reaches', () => {
    // 6d10 rolling all 1s is a pool of 6: the 4 HP goblin is blinded, the 7 HP one isn't.
    const [weak, strong] = cast('color-spray', [goblin('weak', 4), goblin('strong', 7)], '2014', () => 0);
    expect(weak!.effect?.conditions).toEqual(['blinded']);
    expect(strong!.effect).toBeUndefined();
  });

  it('dimension door teleports and deals no damage', () => {
    for (const edition of ['2014', '2024'] as const) {
      expect(spell('dimension-door', edition)).toMatchObject({ teleport: 500, damage: [], automated: true });
    }
  });

  it('resilient sphere shuts a creature in, immune to all damage', () => {
    const [r] = cast('resilient-sphere', [goblin('g', 7)], '2014', () => 0);
    expect(r!.effect).toMatchObject({ name: 'Enclosed', immobile: true });
    const sealed = { ...goblin('g', 7), effects: [r!.effect!] };
    expect(side(sealed).sheet.immunities).toContain('fire');
  });

  it('stinking cloud and spike growth are lasting zones', () => {
    expect(spell('stinking-cloud', '2024')).toMatchObject({ zone: { onCast: true }, save: { ability: 'con' } });
    expect(spell('spike-growth')).toMatchObject({ zone: { onCast: false }, damage: [{ dice: '2d4' }] });
  });

  it('summoning spells offer their creatures', () => {
    expect(spell('animate-dead').summon?.options.map((o) => o.monster)).toEqual(['skeleton', 'zombie']);
    expect(spell('conjure-elemental').summon?.turn).toBe('own');
  });

  it('heat metal burns without a save to halve it, again with a bonus action', () => {
    expect(spell('heat-metal')).toMatchObject({ repeat: 'bonus' });
    expect(spell('heat-metal').save).toBeUndefined();
    expect(spell('heat-metal', '2024')).toMatchObject({ damage: [{ dice: '2d8', type: 'fire' }] });
  });

  it('2014 conversion slips are fixed: fire shield and control water are no longer area damage', () => {
    expect(spell('fire-shield')).toMatchObject({ targets: 0, effect: { retaliate: [{ dice: '2d8', type: 'fire' }] } });
    expect(spell('fire-shield').area).toBeUndefined();
    expect(spell('control-water')).toMatchObject({ automated: false, manual: { kind: 'utility' } });
  });
});
