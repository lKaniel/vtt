import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { auraEffects } from './auras.ts';
import { rollCheck } from './checks.ts';
import { type Token, TokenSchema } from './token-schema.ts';
import { resolveCast, withChoice } from './spells.ts';
import { spellCreature } from './spell-creatures.ts';
import type { Edition } from './stats-schema.ts';

// Utility and social spells that have rules to run: bonuses to checks,
// saves and effects that last, conditions they end, and helpers they conjure.

const spell = (id: string, edition: Edition = '2014') => srdFor(edition).spells.get(id)!;
const druid = (patch: Partial<Token> = {}) =>
  TokenSchema.parse({
    id: 'dru',
    name: 'Druid',
    x: 50,
    y: 50,
    ownership: { default: 'limited', ana: 'owner' },
    stats: { class: 'druid', level: 9, abilities: { wis: 18, dex: 14 }, skills: ['stealth'] },
    ...patch,
  });
const ally = (patch: Partial<Token> = {}) =>
  TokenSchema.parse({
    id: 'ally',
    name: 'Ally',
    x: 150,
    y: 50,
    ownership: { default: 'limited', bo: 'owner' },
    stats: { class: 'fighter', level: 3, abilities: { str: 16, dex: 10 } },
    ...patch,
  });
const goblin = (patch: Partial<Token> = {}) =>
  TokenSchema.parse({
    id: 'gob',
    name: 'Goblin',
    x: 150,
    y: 50,
    monster: 'goblin',
    ownership: { default: 'none' },
    ...patch,
  });
const side = (token: Token, edition: Edition = '2014') => ({ token, sheet: resolveCreature(token, srdFor(edition))! });
const cast = (
  id: string,
  targets: Token[],
  { edition = '2014', rng = () => 0.5, choice }: { edition?: Edition; rng?: () => number; choice?: string } = {},
) => {
  const s = withChoice(spell(id, edition), choice);
  return resolveCast(
    {
      spell: s,
      slot: s.level,
      caster: side(druid(), edition),
      targets: targets.map((t) => side(t, edition)),
      gridSize: 100,
    },
    rng,
  ).results;
};
const sheetWith = (token: Token, edition: Edition = '2014') => resolveCreature(token, srdFor(edition))!;

describe('pass without trace', () => {
  it.each(['2014', '2024'] as const)('%s: the caster and allies within 30 ft get +10 to Stealth checks', (edition) => {
    const [r] = cast('pass-without-trace', [druid()], { edition });
    const caster = druid({ effects: [r!.effect!] });
    const auras = auraEffects(
      [caster, ally(), goblin({ x: 250, monster: edition === '2014' ? 'goblin' : 'goblin-warrior' })].map((t) =>
        side(t, edition),
      ),
      { gridSize: 100 },
    );
    const stealthy = { ...ally(), effects: auras.get('ally') };
    expect(auras.get('gob')).toBeUndefined();
    const plain = rollCheck(ally(), sheetWith(ally(), edition), { ability: 'dex', skill: 'stealth' }, () => 0.5);
    const hidden = rollCheck(stealthy, sheetWith(stealthy, edition), { ability: 'dex', skill: 'stealth' }, () => 0.5);
    expect(hidden.total - plain.total).toBe(10);
    const athletics = rollCheck(
      stealthy,
      sheetWith(stealthy, edition),
      { ability: 'str', skill: 'athletics' },
      () => 0.5,
    );
    expect(athletics.total).toBe(
      rollCheck(ally(), sheetWith(ally(), edition), { ability: 'str', skill: 'athletics' }, () => 0.5).total,
    );
  });
});

describe('guidance', () => {
  it('2014: adds a d4 to one ability check, then it is used up', () => {
    const [r] = cast('guidance', [ally()]);
    const guided = ally({ effects: [r!.effect!] });
    const check = rollCheck(guided, sheetWith(guided), { ability: 'str' }, () => 0.5);
    expect(check.roll?.formula).toMatch(/\+1d4$/);
    expect(check.used).toEqual([r!.effect!.id]);
  });

  it('2024: adds a d4 to checks with the chosen skill while it lasts', () => {
    const [r] = cast('guidance', [ally()], { edition: '2024', choice: 'perception' });
    const guided = ally({ effects: [r!.effect!] });
    const look = rollCheck(guided, sheetWith(guided, '2024'), { ability: 'wis', skill: 'perception' }, () => 0.5);
    expect(look.roll?.formula).toMatch(/\+1d4$/);
    expect(look.used ?? []).toEqual([]);
    const lift = rollCheck(guided, sheetWith(guided, '2024'), { ability: 'str', skill: 'athletics' }, () => 0.5);
    expect(lift.roll?.formula).not.toMatch(/1d4/);
  });
});

describe('enhance ability', () => {
  it('gives advantage on checks of the chosen ability', () => {
    const [r] = cast('enhance-ability', [ally()], { choice: 'cat' });
    const graceful = ally({ effects: [r!.effect!] });
    expect(rollCheck(graceful, sheetWith(graceful), { ability: 'dex' }, () => 0.5).roll?.formula).toMatch(/^2d20kh1/);
    expect(rollCheck(graceful, sheetWith(graceful), { ability: 'str' }, () => 0.5).roll?.formula).toMatch(/^1d20/);
  });

  it("2014 bear's endurance also gives 2d6 temporary hit points", () => {
    const [r] = cast('enhance-ability', [ally()], { choice: 'bear' });
    expect(r!.tempHp).toBeGreaterThan(0);
    expect(r!.effect?.checkAdvantageFor).toEqual(['con']);
  });
});

describe('calm emotions', () => {
  it('ends charm and fear on a creature that fails its save, and keeps them off', () => {
    const scared = goblin({ effects: [{ id: 'fear', name: 'Fear', conditions: ['frightened'] }] });
    const [r] = cast('calm-emotions', [scared], { rng: () => 0 });
    expect(r!.cured).toEqual(['fear']);
    expect(r!.effect?.conditionImmunities).toEqual(['charmed', 'frightened']);
    const [kept] = cast('calm-emotions', [scared], { rng: () => 0.99 });
    expect(kept!.cured).toBeUndefined();
  });
});

describe('enthrall', () => {
  it('a creature that fails has disadvantage on Wisdom checks', () => {
    const [r] = cast('enthrall', [goblin()], { rng: () => 0 });
    expect(r!.effect?.checkDisadvantageFor).toEqual(['wis']);
  });
});

describe('helpers conjured by a spell', () => {
  it.each(['mage-hand', 'unseen-servant', 'floating-disk', 'arcane-eye'])(
    '%s summons a creature with no attacks',
    (id) => {
      for (const edition of ['2014', '2024'] as const) {
        const option = spell(id, edition).summon?.options[0];
        expect(option?.creature, `${id} ${edition}`).toBeDefined();
        expect(
          spellCreature(option!, { slot: spell(id, edition).level, level: spell(id, edition).level, attack: 5, mod: 3 })
            ?.attacks,
        ).toEqual([]);
      }
    },
  );

  it('phantom steed is a riding horse', () => {
    expect(spell('phantom-steed').summon?.options[0]?.monster).toBe('riding-horse');
  });
});

describe('lights and doors', () => {
  it('continual flame and dancing lights shed light', () => {
    for (const edition of ['2014', '2024'] as const) {
      expect(spell('continual-flame', edition).effect?.light).toBeDefined();
      expect(spell('dancing-lights', edition).places?.light).toBeDefined();
    }
  });

  it('knock opens and arcane lock locks a door', () => {
    expect(spell('knock').door).toBe('unlock');
    expect(spell('arcane-lock', '2024').door).toBe('lock');
  });
});

describe('contact other plane', () => {
  it('makes the caster save against DC 15 or take 6d6 psychic damage and go insane', () => {
    const [failed] = cast('contact-other-plane', [druid()], { rng: () => 0 });
    expect(failed!.save).toMatchObject({ dc: 15, success: false });
    expect(failed!.damage).toBeGreaterThan(0);
    expect(failed!.effect?.conditions).toEqual(['incapacitated']);
  });
});

describe('illusions and sensors', () => {
  it.each(['minor-illusion', 'silent-image', 'major-image', 'project-image', 'clairvoyance'])(
    '%s puts a token where the illusion or sensor is',
    (id) => {
      for (const edition of ['2014', '2024'] as const) {
        expect(spell(id, edition).summon?.options[0]?.creature, `${id} ${edition}`).toBeDefined();
      }
    },
  );
});
