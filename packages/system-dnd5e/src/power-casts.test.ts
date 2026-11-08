import { describe, expect, it } from 'vitest';
import { featureSpell } from './features.ts';
import { pickedSpell } from './powers.ts';
import { resolveCast } from './spells.ts';
import { SpellSchema } from './spell-schema.ts';
import type { Token } from './token-schema.ts';
import { poolCaster, poolSheetOf } from './pool-class.fixtures.ts';

// Pool features cast like spells: bolt multipliers, mindless and heavy minds,
// split damage, a crowd's save, and saves with advantage against conditions.

const face = (f: number, sides: number) => (f - 0.5) / sides;
const rngOf = (values: number[]) => () => values.shift() ?? 0.5;

const caster = (level: number) => {
  const token = poolCaster(level);
  return { token, sheet: poolSheetOf(token) };
};
const monster = (id: string, monsterId: string, over: Partial<Token> = {}) => {
  const token = { id, name: id, x: 50, y: 0, size: 1, speed: 30, monster: monsterId, ...over } as Token;
  return { token, sheet: poolSheetOf(token) };
};
const spellOf = (level: number, feature: string, picks: string[] = []) => {
  const f = caster(level).sheet.features.find((x) => x.id === feature)!;
  return SpellSchema.parse({ ...featureSpell(f), ...pickedSpell(f, picks) });
};
const cast = (
  level: number,
  input: { spell: ReturnType<typeof spellOf>; targets: ReturnType<typeof monster>[] },
  rng: () => number,
) => {
  const c = caster(level);
  return resolveCast(
    {
      ...input,
      slot: 0,
      caster: c,
      gridSize: 50,
      dc: c.sheet.pool!.dc,
      attackBonus: c.sheet.pool!.attack,
      mod: c.sheet.pool!.mod,
    },
    rng,
  );
};

describe('a pool bolt', () => {
  it('hits with the pool attack bonus and multiplies its damage', () => {
    const out = cast(
      3,
      { spell: spellOf(3, 'bolt'), targets: [monster('orc', 'orc')] },
      rngOf([face(10, 20), face(6, 10)]),
    );
    expect(out.results[0]).toMatchObject({ hit: true });
    expect(out.results[0]!.attack!.total).toBe(15); // 10 + prof 2 + Wis 3
    expect(out.results[0]!.damage).toBe(Math.floor((6 + 3) * 1.5));
  });

  it("doesn't work on mindless creatures", () => {
    const out = cast(
      1,
      { spell: spellOf(1, 'bolt'), targets: [monster('ooze', 'ochre-jelly')] },
      rngOf([face(19, 20)]),
    );
    expect(out.results[0]).toMatchObject({ immune: true, damage: 0 });
  });

  it('leaves the picked shape on a hit', () => {
    const out = cast(
      1,
      { spell: spellOf(1, 'bolt', ['disorienting']), targets: [monster('orc', 'orc')] },
      rngOf([face(19, 20)]),
    );
    expect(out.results[0]!.effect).toMatchObject({ name: 'Disoriented', speed: -10, rounds: 1, source: 'nyx' });
  });

  it('splits one roll among its targets on a hit', () => {
    const spell = { ...spellOf(3, 'bolt'), split: true };
    const targets = [monster('a', 'orc'), monster('b', 'orc')];
    const out = cast(3, { spell, targets }, rngOf([face(8, 10), face(19, 20)]));
    const each = Math.floor(((8 + 3) * 1.5) / 2);
    expect(out.results.map((r) => r.damage)).toEqual([each, each]);
  });

  it('splits nothing on a miss', () => {
    const spell = { ...spellOf(3, 'bolt'), split: true };
    const out = cast(
      3,
      { spell, targets: [monster('a', 'orc'), monster('b', 'orc')] },
      rngOf([face(8, 10), face(1, 20)]),
    );
    expect(out.results.map((r) => r.target)).toEqual(['a']);
  });
});

describe('a volley at many creatures', () => {
  it('frightens a crowd of three that fails the barrage save', () => {
    const targets = ['a', 'b', 'c'].map((id) => monster(id, 'orc'));
    // shared damage roll, three volley saves (fail), three barrage saves (fail, fail, pass)
    const rng = rngOf([face(1, 10), face(2, 20), face(2, 20), face(2, 20), face(2, 20), face(2, 20), face(20, 20)]);
    const out = cast(5, { spell: spellOf(5, 'volley'), targets }, rng);
    expect(out.results.map((r) => r.effects?.[0]?.conditions)).toEqual([['frightened'], ['frightened'], undefined]);
  });

  it('leaves two creatures alone', () => {
    const targets = ['a', 'b'].map((id) => monster(id, 'commoner'));
    const out = cast(5, { spell: spellOf(5, 'volley'), targets }, rngOf([face(5, 10), face(2, 20), face(2, 20)]));
    expect(out.results.some((r) => r.effects)).toBe(false);
  });
});

describe('weights and conditions', () => {
  it('passes over minds heavier than the limit', () => {
    const spell = { ...spellOf(1, 'weave', ['sight']), maxWeight: 2 };
    const out = cast(1, { spell, targets: [monster('goblin', 'goblin'), monster('couatl', 'couatl')] }, rngOf([]));
    expect(out.results.map((r) => !!r.immune)).toEqual([false, true]);
  });

  it('saves with advantage against the conditions it resists', () => {
    const fear = SpellSchema.parse({
      id: 'fear-test',
      name: 'Fear',
      level: 0,
      school: 'feature',
      castingTime: 'action',
      range: 60,
      save: { ability: 'wis' },
      effect: { conditions: ['frightened'] },
    });
    const brave = monster('brave', 'commoner', {
      effects: [{ id: 'eye', name: "Mind's Eye", conditionSaveAdvantage: ['frightened'] }],
    });
    const out = cast(1, { spell: fear, targets: [brave] }, rngOf([face(2, 20), face(19, 20)]));
    expect(out.results[0]!.save?.success).toBe(true);
  });
});

describe('reactions and zones', () => {
  it('takes away reactions', async () => {
    const { canReact } = await import('./effects.ts');
    const stunned = monster('orc', 'orc', { effects: [{ id: 'o', name: 'Overcharged', noReactions: true }] });
    expect(canReact(stunned.sheet)).toBe(false);
    expect(canReact(monster('orc', 'orc').sheet)).toBe(true);
  });

  it('reaches only light minds with a zone', async () => {
    const { auraEffects } = await import('./auras.ts');
    const c = caster(5);
    const zone = {
      id: 'z',
      name: 'Haunted',
      source: 'nyx',
      linked: true,
      aura: { radius: 15, who: 'all' as const, self: false, maxWeight: 2 },
    };
    const bearer = { token: { ...c.token, effects: [zone] }, sheet: poolSheetOf({ ...c.token, effects: [zone] }) };
    const near = (id: string, m: string) => monster(id, m, { x: 50, y: 0 });
    const out = auraEffects([bearer, near('goblin', 'goblin'), near('couatl', 'couatl')], { gridSize: 50 });
    expect([...out.keys()]).toEqual(['goblin']);
    expect(out.get('goblin')![0]).toMatchObject({ linked: true, source: 'nyx' });
  });
});
