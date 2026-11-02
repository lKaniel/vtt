import { srdFor, type TokenView } from '@vtt/system-dnd5e';
import { describe, expect, it } from 'vitest';
import {
  aimAtTargets,
  aimFor,
  aimScroll,
  aimSpell,
  castMessage,
  needsClearPath,
  pick,
  scrollAiming,
} from './targeting.ts';

const spell = (id: string) => srdFor('2014').spells.get(id)!;

describe('aiming a spell', () => {
  it('casts self spells at once', () => {
    expect(aimSpell(spell('shield'), 1, 5)).toEqual({
      spell: spell('shield'),
      slot: 1,
      mode: 'self',
      picks: [],
      need: 0,
    });
  });

  it('asks for a point for areas, teleports and summons', () => {
    expect(aimSpell(spell('fireball'), 3, 5).mode).toBe('point');
    expect(aimSpell(spell('misty-step'), 2, 5).mode).toBe('point');
    expect(aimSpell(spell('find-familiar'), 1, 5)).toMatchObject({ mode: 'point', summon: 'bat' });
  });

  it('conjures a lasting weapon without a target, then attacks with it', () => {
    const blade = spell('flame-blade');
    const caster = { caster: { level: 5, spells: [blade] }, effects: [] } as never;
    expect(aimFor(caster, 'flame-blade', { slot: 2, free: false })).toMatchObject({ mode: 'self', need: 0 });
    const going = {
      caster: { level: 5, spells: [blade] },
      effects: [{ repeat: { spell: 'flame-blade', slot: 2 } }],
    } as never;
    expect(aimFor(going, 'flame-blade', { slot: 2, free: false })).toMatchObject({ mode: 'creatures', repeat: true });
  });

  it('asks for as many creatures as the spell has targets or beams at that slot', () => {
    expect(aimSpell(spell('fire-bolt'), 0, 5)).toMatchObject({ mode: 'creatures', need: 1 });
    expect(aimSpell(spell('magic-missile'), 2, 5)).toMatchObject({ mode: 'creatures', need: 4 });
    expect(aimSpell(spell('bless'), 1, 5)).toMatchObject({ need: 3 });
    expect(aimSpell(spell('eldritch-blast'), 0, 11)).toMatchObject({ need: 3 });
  });

  it('collects picks, the same creature more than once for beams, until enough', () => {
    const aiming = aimSpell(spell('magic-missile'), 1, 5);
    const one = pick(aiming, 'goblin');
    expect(one).toMatchObject({ done: false, aiming: { picks: ['goblin'] } });
    const three = pick(pick(one.aiming, 'goblin').aiming, 'orc');
    expect(three).toMatchObject({ done: true, aiming: { picks: ['goblin', 'goblin', 'orc'] } });
  });

  it('picks each creature at most once for spells without beams', () => {
    const aiming = aimSpell(spell('bless'), 1, 5);
    expect(pick(pick(aiming, 'ana').aiming, 'ana').aiming.picks).toEqual(['ana']);
  });

  it('builds the message for the server', () => {
    const aiming = { ...aimSpell(spell('fireball'), 3, 5) };
    expect(castMessage('wiz', aiming, [250, 150])).toEqual({
      t: 'cast',
      caster: 'wiz',
      spell: 'fireball',
      slot: 3,
      targets: [],
      point: [250, 150],
    });
  });
});

describe('aiming at your targets', () => {
  it('picks them, and is done when the spell has all it needs', () => {
    const bolt = aimAtTargets(aimSpell(spell('fire-bolt'), 0, 5), ['goblin']);
    expect(bolt).toMatchObject({ aiming: { picks: ['goblin'] }, done: true });
    const bless = aimAtTargets(aimSpell(spell('bless'), 1, 5), ['ana']);
    expect(bless).toMatchObject({ aiming: { picks: ['ana'] }, done: false });
  });

  it('takes no more than the spell can, and sends every beam at them in turn', () => {
    expect(aimAtTargets(aimSpell(spell('fire-bolt'), 0, 5), ['a', 'b']).aiming.picks).toEqual(['a']);
    expect(aimAtTargets(aimSpell(spell('magic-missile'), 1, 5), ['a', 'b'])).toMatchObject({
      aiming: { picks: ['a', 'b', 'a'] },
      done: true,
    });
  });

  it('leaves the aiming alone with no targets, or when it isn’t at creatures', () => {
    const fireball = aimSpell(spell('fireball'), 3, 5);
    expect(aimAtTargets(fireball, ['a'])).toEqual({ aiming: fireball, done: false });
    const bolt = aimSpell(spell('fire-bolt'), 0, 5);
    expect(aimAtTargets(bolt, [])).toEqual({ aiming: bolt, done: false });
  });
});

describe('casting for free', () => {
  it('tells the server not to spend a slot', () => {
    const aiming = { ...aimSpell(spell('magic-missile'), 2, 5), free: true };
    expect(castMessage('wiz', aiming)).toMatchObject({ slot: 2, free: true });
    expect(castMessage('wiz', aimSpell(spell('magic-missile'), 1, 5))).not.toHaveProperty('free');
  });
});

describe('reading a scroll', () => {
  it('aims the scroll’s spell at its own level and tells the server to read the scroll', () => {
    const aiming = aimScroll(spell('magic-missile'), 5);
    expect(aiming).toMatchObject({ slot: 1, need: 3, scroll: true });
    expect(castMessage('wiz', aiming)).toMatchObject({ spell: 'magic-missile', slot: 1, scroll: true });
  });

  it('looks the spell up in the reader’s rules and scales cantrips by their level', () => {
    const reader = { stats: { level: 11 }, sheet: { edition: '2014' } } as unknown as TokenView;
    expect(scrollAiming(reader, 'scorching-ray')).toMatchObject({ slot: 2, need: 3, scroll: true });
    expect(scrollAiming(reader, 'eldritch-blast')).toMatchObject({ need: 3 });
    expect(scrollAiming(undefined, 'eldritch-blast')).toMatchObject({ need: 1 });
    expect(scrollAiming(reader, 'nope')).toBeUndefined();
    expect(scrollAiming(reader, undefined)).toBeUndefined();
  });
});

describe('needsClearPath', () => {
  it('skips the line check for areas that start at the caster, whose point only sets a direction', () => {
    expect(needsClearPath(spell('burning-hands'))).toBe(false);
    expect(needsClearPath(spell('fireball'))).toBe(true);
    expect(needsClearPath(spell('fire-bolt'))).toBe(true);
  });
});

describe('using a lasting spell again', () => {
  it('aims a spell that is going with its own slot, as a repeat (spiritual weapon)', () => {
    const weapon = srdFor('2014').spells.get('spiritual-weapon')!;
    const going = { id: 'sw', name: 'Spiritual Weapon', repeat: { spell: 'spiritual-weapon', slot: 3 } };
    const sheet = { caster: { level: 5, spells: [weapon] }, effects: [going] } as never;
    const aiming = aimFor(sheet, 'spiritual-weapon', { slot: 2, free: false })!;
    expect(castMessage('hero', { ...aiming, picks: ['orc'] })).toMatchObject({
      slot: 3,
      repeat: true,
      targets: ['orc'],
    });
    expect(aimFor({ ...(sheet as object), effects: [] }, 'spiritual-weapon', { slot: 2, free: false })).toMatchObject({
      slot: 2,
    });
  });
});
