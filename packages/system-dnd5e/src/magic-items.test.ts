import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { rollCheck } from './checks.ts';
import { rollAttack } from './attack.ts';
import { useItem } from './items.ts';
import { type Token, TokenSchema } from './token-schema.ts';
import type { Edition } from './stats-schema.ts';
import { resolveWeaponAttack } from './weapon-attack.ts';

// Magic items at work: what they do while worn, on hits and when used.

const pc = (inventory: object[], rules: Edition = '2014', data: object = {}) =>
  TokenSchema.parse({
    id: 'pc',
    name: 'PC',
    x: 50,
    y: 50,
    stats: { class: 'fighter', level: 3, rules, maxHp: 30, abilities: { str: 16, dex: 14 } },
    inventory,
    ...data,
  });
const foe = (monster: string) => TokenSchema.parse({ id: 'foe', name: 'Foe', x: 150, y: 50, monster });
const sheet = (t: Token) => resolveCreature(t, srdFor(t.stats?.rules ?? '2014'))!;
const face = (n: number, sides: number) => (n - 1) / sides + 0.001;
const rngOf = (values: number[]) => () => values.shift() ?? 0.001;
const worn = (item: string, attuned = false) => ({ item, equipped: true, ...(attuned && { attuned }) });

function hit(attacker: Token, target: Token, name: string, rng: number[] = [face(18, 20)]) {
  const a = { token: attacker, sheet: sheet(attacker) };
  return resolveWeaponAttack(
    {
      attacker: a,
      target: { token: target, sheet: sheet(target) },
      attack: a.sheet.attacks.find((x) => x.name === name)!,
      range: 'normal',
      gridSize: 100,
      allyNearTarget: false,
      sneakUsed: false,
    },
    rngOf(rng),
  );
}

describe.each(['2014', '2024'] as const)('the %s SRD items', (rules) => {
  const items = srdFor(rules).items;

  it('list every weapon, armor, tool and magic item, with Foundry-style variants', () => {
    expect(items.size).toBeGreaterThan(900);
    expect(items.get('longsword-plus-1')?.name).toBe('Longsword +1');
    expect(items.get('flame-tongue-greatsword')?.name).toBe('Flame Tongue Greatsword');
    expect(items.get('ring-of-resistance-fire')?.name).toBe('Ring of Resistance (Fire)');
    expect(items.get('thieves-tools')?.type).toBe('gear');
    expect(items.get('musket')?.type).toBe('weapon');
  });

  it('keep the ids older worlds carry', () => {
    for (const id of ['rope', 'oil-flask', 'lantern-hooded', 'healer-s-kit', 'spell-scroll', 'potion-of-healing'])
      expect(items.has(id), id).toBe(true);
  });
});

describe('worn magic items', () => {
  it('set ability scores while attuned (a belt of giant strength)', () => {
    expect(sheet(pc([worn('belt-of-hill-giant-strength', true)])).abilities.str).toBe(21);
    expect(sheet(pc([worn('belt-of-hill-giant-strength')])).abilities.str).toBe(16);
  });

  it('give resistances, speeds and advantage on skills', () => {
    expect(sheet(pc([worn('ring-of-resistance-fire', true)])).resistances).toContain('fire');
    const elvenkind = pc([worn('cloak-of-elvenkind', true)]);
    const stealth = rollCheck(elvenkind, sheet(elvenkind), { ability: 'dex', skill: 'stealth' }, rngOf([0.5, 0.9]));
    expect(stealth.roll?.formula).toMatch(/^2d20kh1/);
    expect(sheet(pc([worn('winged-boots', true)])).speeds).toEqual({ fly: 30 });
  });

  it('add a +1 armor to its AC', () => {
    expect(sheet(pc([worn('chain-mail')])).ac).toBe(16);
    expect(sheet(pc([worn('chain-mail-plus-1')])).ac).toBe(17);
  });

  it("add a wand of the war mage's bonus to spell attacks", () => {
    const wizard = (inventory: object[]) =>
      pc(inventory, '2014', { stats: { class: 'wizard', level: 3, abilities: { int: 16 } } });
    const plain = sheet(wizard([])).caster!;
    const wand = sheet(wizard([worn('wand-of-the-war-mage-plus-1', true)])).caster!;
    expect(wand.attack).toBe(plain.attack + 1);
  });
});

describe('magic weapons', () => {
  it('add their +1 to attack and damage', () => {
    const plain = sheet(pc([worn('longsword')])).attacks.find((a) => a.name === 'Longsword')!;
    const magic = sheet(pc([worn('longsword-plus-1')])).attacks.find((a) => a.name === 'Longsword +1')!;
    expect(magic.toHit).toBe(plain.toHit + 1);
    expect(magic.damage[0]!.dice).toBe('1d8+4');
  });

  it('deal their extra damage on a hit (flame tongue)', () => {
    const out = hit(pc([worn('flame-tongue-longsword', true)]), foe('ogre'), 'Flame Tongue Longsword');
    expect(out.roll.damage.map((d) => `${d.roll.formula} ${d.type}`)).toContain('2d6 fire');
  });

  it('deal slayer damage only to their foes', () => {
    const slayer = pc([worn('dragon-slayer-longsword')]);
    const types = (target: Token) =>
      hit(slayer, target, 'Dragon Slayer Longsword').roll.damage.map((d) => d.roll.formula);
    expect(types(foe('young-red-dragon'))).toContain('3d6');
    expect(types(foe('ogre'))).not.toContain('3d6');
  });

  it('take their bonus from magic ammunition', () => {
    const archer = pc([worn('longbow'), worn('arrows-plus-1')]);
    const plain = sheet(pc([worn('longbow')])).attacks.find((a) => a.name === 'Longbow')!;
    expect(sheet(archer).attacks.find((a) => a.name === 'Longbow')!.toHit).toBe(plain.toHit + 1);
  });
});

describe('adamantine armor', () => {
  it('turns critical hits into normal hits', () => {
    const wearer = sheet(pc([worn('adamantine-armor-plate')]));
    const attack = {
      name: 'Club',
      kind: 'melee' as const,
      toHit: 5,
      reach: 5,
      damage: [{ dice: '1d4', type: 'bludgeoning' as const }],
    };
    const out = rollAttack(attack, wearer, {}, rngOf([face(20, 20), 0.5]));
    expect(out.hit).toBe(true);
    expect(out.crit).toBe(false);
  });
});

describe('using items', () => {
  it('drinking a potion of giant strength sets Strength for an hour', () => {
    const t = pc([{ item: 'potion-of-hill-giant-strength' }]);
    const out = useItem(t, sheet(t), srdFor('2014').items.get('potion-of-hill-giant-strength')!);
    expect(out.token.inventory).toEqual([]);
    expect(out.token.effects?.[0]).toMatchObject({ name: 'Potion of Hill Giant Strength', rounds: 600 });
    expect(sheet(out.token).abilities.str).toBe(21);
  });

  it('a potion of heroism gives temporary hit points and bless', () => {
    const t = pc([{ item: 'potion-of-heroism' }]);
    const out = useItem(t, sheet(t), srdFor('2014').items.get('potion-of-heroism')!);
    expect(out.token.tempHp).toBe(10);
    expect(out.token.effects?.[0]).toMatchObject({ attackBonus: '1d4', saveBonus: '1d4' });
  });

  it('reading a manual raises the score for good', () => {
    const t = pc([{ item: 'manual-of-bodily-health' }]);
    const out = useItem(t, sheet(t), srdFor('2014').items.get('manual-of-bodily-health')!);
    expect(out.token.stats?.abilities?.con).toBe(12);
  });

  it('keep a ring of free action’s wearer from being paralyzed or restrained', () => {
    const ring = { item: 'ring-of-free-action', equipped: true, attuned: true };
    const held = { id: 'hold', name: 'Hold Person', conditions: ['paralyzed', 'restrained'] };
    expect(sheet(pc([], '2014', { effects: [held] })).conditions).toContain('paralyzed');
    expect(sheet(pc([ring], '2014', { effects: [held] })).conditions).toEqual([]);
  });
});
