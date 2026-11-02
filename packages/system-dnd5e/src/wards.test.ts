import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { type Token, TokenSchema } from './token-schema.ts';
import type { Effect } from './spell-schema.ts';
import type { Edition } from './stats-schema.ts';
import { resolveWeaponAttack } from './weapon-attack.ts';
import { blinkAway, lessImages, sanctuarySave, withBanishment, withoutSanctuary } from './wards.ts';

// What stands between an attacker and its target: mirror image's duplicates,
// sanctuary's save, and ray of enfeeblement's weakened blows.

const pc = (rules: Edition, effects: Effect[] = []) =>
  TokenSchema.parse({
    id: 'pc',
    name: 'PC',
    x: 50,
    y: 50,
    stats: { class: 'wizard', level: 5, rules, maxHp: 30, abilities: { dex: 16 } },
    effects,
  });
const ogre = (effects: Effect[] = []) =>
  TokenSchema.parse({ id: 'ogre', name: 'Ogre', x: 150, y: 50, monster: 'ogre', effects });
const side = (t: Token) => ({ token: t, sheet: resolveCreature(t, srdFor(t.stats?.rules ?? '2014'))! });
const face = (n: number, sides: number) => (n - 1) / sides + 0.001;
const rngOf = (values: number[]) => () => values.shift() ?? 0.001;
const images = (n: number): Effect => ({ id: 'mirror', name: 'Mirror Image', images: n });

function club(attacker: Token, target: Token, rng: number[]) {
  const a = side(attacker);
  return resolveWeaponAttack(
    {
      attacker: a,
      target: side(target),
      attack: a.sheet.attacks.find((x) => x.name === 'Greatclub')!,
      range: 'normal',
      gridSize: 100,
      allyNearTarget: false,
      sneakUsed: false,
    },
    rngOf(rng),
  );
}

describe('mirror image', () => {
  it('2014: a d20 of 6 or more with three duplicates turns the attack on one, which it destroys if it hits', () => {
    const out = club(ogre(), pc('2014', [images(3)]), [face(15, 20), 0.5, 0.5, face(6, 20)]);
    expect(out.decoy).toBe('hit');
    expect(out.roll.hit).toBe(false);
    expect(out.roll.damage).toEqual([]);
  });

  it('2014: fewer duplicates need a higher roll', () => {
    const out = club(ogre(), pc('2014', [images(1)]), [face(15, 20), 0.5, 0.5, face(10, 20)]);
    expect(out.decoy).toBeUndefined();
    expect(out.roll.hit).toBe(true);
  });

  it('2014: an attack turned on a duplicate can miss it (AC 10 + the caster’s Dexterity)', () => {
    // 3 + 6 = 9 misses the PC (AC 13 with dex) and the duplicate alike.
    const out = club(ogre(), pc('2014', [images(3)]), [face(3, 20), face(20, 20)]);
    expect(out.decoy).toBe('missed');
  });

  it('2024: a hit lands on a duplicate when any d6 rolled for them shows 3 or more', () => {
    const out = club(ogre(), pc('2024', [images(3)]), [face(15, 20), 0.5, 0.5, face(1, 6), face(2, 6), face(3, 6)]);
    expect(out.decoy).toBe('hit');
    expect(out.roll.damage).toEqual([]);
  });

  it('2024: a miss leaves the duplicates alone', () => {
    const out = club(ogre(), pc('2024', [images(3)]), [face(2, 20)]);
    expect(out.decoy).toBeUndefined();
  });

  it('doesn’t fool a blinded attacker', () => {
    const blind: Effect = { id: 'b', name: 'Blinded', conditions: ['blinded'] };
    const out = club(ogre([blind]), pc('2014', [images(3)]), [face(19, 20), 0.5, 0.5, face(20, 20)]);
    expect(out.decoy).toBeUndefined();
  });

  it('a destroyed duplicate leaves one fewer, and the spell ends with the last', () => {
    expect(lessImages(pc('2014', [images(2)])).effects).toEqual([images(1)]);
    expect(lessImages(pc('2014', [images(1)])).effects).toEqual([]);
  });
});

describe('weakened blows', () => {
  const plain = club(ogre(), pc('2014'), [face(15, 20), 0.5, 0.5]);
  const dealt = (o: typeof plain) => o.roll.damage.reduce((n, d) => n + d.roll.total, 0);

  it('2014 ray of enfeeblement halves Strength weapon damage', () => {
    const weak: Effect = { id: 'ray', name: 'Enfeebled', weakened: 'half' };
    const out = club(ogre([weak]), pc('2014'), [face(15, 20), 0.5, 0.5]);
    expect(dealt(out)).toBe(Math.floor(dealt(plain) / 2));
  });

  it('2024 ray of enfeeblement takes 1d8 off the damage', () => {
    const weak: Effect = { id: 'ray', name: 'Enfeebled', weakened: '1d8' };
    const out = club(ogre([weak]), pc('2014'), [face(15, 20), 0.5, 0.5, face(3, 8)]);
    expect(dealt(out)).toBe(dealt(plain) - 3);
  });
});

describe('sanctuary', () => {
  const warded = pc('2014', [{ id: 'sanctuary-cleric', name: 'Sanctuary', source: 'cleric', sanctuary: 13 }]);

  it('makes an attacker save against the ward’s DC', () => {
    expect(sanctuarySave(side(ogre()).sheet, side(warded).sheet, rngOf([face(2, 20)]))?.success).toBe(false);
    expect(sanctuarySave(side(ogre()).sheet, side(warded).sheet, rngOf([face(20, 20)]))?.success).toBe(true);
  });

  it('asks nothing of attackers when there is no ward', () => {
    expect(sanctuarySave(side(ogre()).sheet, side(pc('2014')).sheet, rngOf([]))).toBeUndefined();
  });

  it('ends when the warded creature attacks', () => {
    expect(withoutSanctuary(warded)?.effects).toEqual([]);
    expect(withoutSanctuary(pc('2014'))).toBeUndefined();
  });
});

describe('banishment and blink', () => {
  const away: Effect = { id: 'banished', name: 'Banished', banished: true };

  it('hides a banished creature and shows it again when the spell ends', () => {
    const gone = withBanishment(pc('2014', [away]))!;
    expect(gone).toMatchObject({ hidden: true, banished: true });
    expect(withBanishment({ ...gone, effects: [] })).toMatchObject({ hidden: false, banished: undefined });
    expect(withBanishment(pc('2014'))).toBeUndefined();
  });

  it('leaves a creature the GM hid alone', () => {
    expect(withBanishment({ ...pc('2014', [away]), hidden: true })).toBeUndefined();
  });

  it('blink sends its bearer away until its next turn on an 11 or higher', () => {
    const blinking = pc('2014', [{ id: 'blink-pc', name: 'Blink', source: 'pc', blink: true }]);
    expect(blinkAway(blinking, rngOf([face(10, 20)]))).toBe(blinking);
    const gone = blinkAway(blinking, rngOf([face(11, 20)]));
    expect(gone.effects?.at(-1)).toMatchObject({ banished: true, source: 'pc', rounds: 1 });
  });
});
