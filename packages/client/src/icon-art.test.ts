import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Attack, type FeatureSheet, srdFor, type TokenView } from '@vtt/system-dnd5e';
import { afterEach, describe, expect, it } from 'vitest';
import manifest from './icon-art.json';
import {
  attackArt,
  CARD_BACK,
  cardBackFor,
  concentrationArt,
  diceArt,
  effectArt,
  featureArt,
  itemArt,
  cutoutOf,
  monsterArt,
  portraitOf,
  spellArt,
} from './icon-art.ts';
import { packAnimation, setPackArt } from './content/pack-art.ts';

const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../public');
const ICONS_DIR = resolve(PUBLIC_DIR, 'art/icons');

const spell = (id: string) => srdFor('2014').spells.get(id)!;
const attack = (kind: Attack['kind']): Attack => ({
  name: 'X',
  kind,
  toHit: 0,
  damage: [{ dice: '1', type: 'slashing' }],
});
const feature = (id: string) => ({ id }) as FeatureSheet;
const item = (id: string) => srdFor('2014').items.get(id);

describe('painted icon art', () => {
  it('matches icon-art.json exactly against the files in public/art/icons', () => {
    for (const kind of ['spells', 'features', 'items', 'conditions', 'actions'] as const) {
      const files = readdirSync(resolve(ICONS_DIR, kind))
        .filter((f) => f.endsWith('.webp'))
        .map((f) => f.slice(0, -'.webp'.length))
        .sort((a, b) => a.localeCompare(b));
      const listed = (manifest as Record<string, string[]>)[kind];
      expect(listed, `${kind} in icon-art.json`).toEqual(files);
    }
  });

  it('finds a spell painting by id', () => {
    expect(spellArt(spell('fireball'))).toBe('/art/icons/spells/fireball.webp');
    expect(spellArt(spell('wish'))).toBe('/art/icons/spells/wish.webp');
    expect(spellArt({ id: 'no-such-spell', name: 'No Such Spell' })).toBeUndefined();
  });

  it('paints attacks as melee or ranged', () => {
    expect(attackArt(attack('melee'))).toBe('/art/icons/actions/melee-attack.webp');
    expect(attackArt(attack('ranged'))).toBe('/art/icons/actions/ranged-attack.webp');
  });

  it('finds class features by id', () => {
    expect(featureArt(feature('second-wind'))).toBe('/art/icons/features/second-wind.webp');
    expect(featureArt(feature('arcane-recovery'))).toBe('/art/icons/features/arcane-recovery.webp');
    expect(featureArt(feature('no-such-feature'))).toBeUndefined();
  });

  it('paints basic actions and their bonus-action versions with the action icons', () => {
    expect(featureArt(feature('dodge'))).toBe('/art/icons/actions/dodge.webp');
    expect(featureArt(feature('cunning-hide'))).toBe('/art/icons/actions/hide.webp');
    expect(featureArt(feature('grapple'))).toBe('/art/icons/actions/shove.webp');
    expect(featureArt({ id: 'escape' })).toBe('/art/icons/actions/disengage.webp');
    expect(featureArt(feature('dash'))).toBe('/art/icons/actions/dash.webp');
    expect(featureArt(feature('cunning-disengage'))).toBe('/art/icons/actions/disengage.webp');
  });

  it('borrows the closest painting for features without their own', () => {
    expect(featureArt(feature('patient-defense'))).toBe('/art/icons/actions/dodge.webp');
    expect(featureArt(feature('step-of-the-wind'))).toBe('/art/icons/actions/dash.webp');
    expect(featureArt(feature('turn-undead'))).toBe('/art/icons/features/channel-divinity.webp');
    expect(featureArt(feature('paladins-smite'))).toBe('/art/icons/features/divine-smite.webp');
  });

  it('finds weapons, armour and gear by item id, falling back to base', () => {
    expect(itemArt(item('longsword'))).toBe('/art/icons/items/longsword.webp');
    expect(itemArt(item('potion-of-healing'))).toBe('/art/icons/items/potion-of-healing.webp');
    expect(itemArt({ id: 'custom-flame-longsword', name: 'Custom Flame Longsword', base: 'longsword' })).toBe(
      '/art/icons/items/longsword.webp',
    );
    expect(itemArt({ id: 'custom-thing', name: 'Custom Thing', base: 'no-such-base' })).toBeUndefined();
    expect(itemArt(undefined)).toBeUndefined();
  });

  it('paints bundled condition and concentration icons', () => {
    expect(effectArt({ conditions: ['poisoned'] })).toBe('/art/icons/conditions/poisoned.webp');
    expect(concentrationArt()).toBe('/art/icons/conditions/concentrating.webp');
  });

  it('paints each die including percentile dice', () => {
    expect(diceArt('d20')).toBe('/art/icons/dice/d20.webp');
    expect(diceArt('d100')).toBe('/art/icons/dice/d100.webp');
  });

  it('shows the painted card back for face-down stacks and non-empty decks', () => {
    expect(CARD_BACK).toBe('/art/ui/cards/card-back.webp');
    expect(existsSync(resolve(PUBLIC_DIR, 'art/ui/cards/card-back.webp'))).toBe(true);
    expect(cardBackFor({ kind: 'deck', count: 52, cards: [] })).toBe(CARD_BACK);
    expect(cardBackFor({ kind: 'deck', count: 52, cards: [{}] })).toBe(CARD_BACK);
    expect(cardBackFor({ kind: 'hand', count: 3, cards: [] })).toBe(CARD_BACK);
    expect(cardBackFor({ kind: 'hand', count: 3, cards: [{}] })).toBeUndefined();
    expect(cardBackFor({ kind: 'pile', count: 2, cards: [{}] })).toBeUndefined();
    expect(cardBackFor({ kind: 'deck', count: 0, cards: [] })).toBeUndefined();
  });

  it('links the bundled favicons in index.html', () => {
    const html = readFileSync(resolve(PUBLIC_DIR, '../index.html'), 'utf8');
    expect(html).toContain('sizes="32x32" href="/favicon-32.png"');
    expect(html).toContain('sizes="512x512" href="/favicon.png"');
    expect(html).toContain('rel="apple-touch-icon" href="/favicon.png"');
    expect(existsSync(resolve(PUBLIC_DIR, 'favicon-32.png'))).toBe(true);
    expect(existsSync(resolve(PUBLIC_DIR, 'favicon.png'))).toBe(true);
  });

  it('keeps zone-art.json in sync with public/art/textures/zones', () => {
    const files = readdirSync(resolve(PUBLIC_DIR, 'art/textures/zones'))
      .filter((f) => f.endsWith('.webp'))
      .map((f) => f.slice(0, -'.webp'.length))
      .sort((a, b) => a.localeCompare(b));
    const listed = JSON.parse(
      readFileSync(resolve(PUBLIC_DIR, '../../system-dnd5e/content/zone-art.json'), 'utf8'),
    ) as string[];
    expect(listed).toEqual(files);
  });

  it("shows a token's own picture, or a hooded stranger when it has none", () => {
    expect(portraitOf({ img: '/assets/orrin.png' } as TokenView)).toBe('/assets/orrin.png');
    expect(portraitOf({} as TokenView)).toBe('/art/ui/portrait-default.webp');
  });

  it("falls back to the monster's painted token, but the token's own picture wins", () => {
    expect(portraitOf({ art: '/art/tokens/goblin.webp' } as TokenView)).toBe('/art/tokens/goblin.webp');
    expect(portraitOf({ img: '/a.png', art: '/art/tokens/goblin.webp' } as TokenView)).toBe('/a.png');
  });

  it('draws only real pictures as cut-outs; the hooded stranger stays in a round frame', () => {
    expect(cutoutOf({ art: '/art/tokens/wolf.webp' } as TokenView)).toBe('/art/tokens/wolf.webp');
    expect(cutoutOf({ img: '/a.png' } as TokenView)).toBe('/a.png');
    expect(cutoutOf({ img: '/assets/goblin-*.webp', art: '/art/tokens/goblin.webp' } as TokenView)).toBe(
      '/art/tokens/goblin.webp',
    );
    expect(cutoutOf({} as TokenView)).toBeUndefined();
  });
});

describe('art from the game’s packs', () => {
  afterEach(() => setPackArt({}));
  const pic = (name: string) => [`pack://icons/media/${name}.webp`];

  it('wins over the bundled paintings, found by id or by name', () => {
    setPackArt({
      spell: { fireball: pic('fireball'), 'my-hex': pic('hex') },
      item: { longsword: pic('sword'), 'potion-of-healing': pic('potion') },
      feature: { 'second-wind': pic('wind') },
    });
    expect(spellArt(spell('fireball'))).toBe('/packs/icons/media/fireball.webp');
    expect(spellArt({ ...spell('fireball'), id: 'x', name: 'My Hex' })).toBe('/packs/icons/media/hex.webp');
    expect(itemArt(item('potion-of-healing'))).toBe('/packs/icons/media/potion.webp');
    expect(featureArt({ id: 'second-wind', name: 'Second Wind' })).toBe('/packs/icons/media/wind.webp');
  });

  it('dresses a magic weapon and a weapon attack as the weapon they are', () => {
    setPackArt({ item: { longsword: pic('sword') } });
    expect(itemArt({ ...item('longsword')!, id: 'flame-tongue-longsword', name: 'Flame Tongue Longsword' })).toBe(
      '/packs/icons/media/sword.webp',
    );
    expect(attackArt({ ...attack('melee'), name: '+1 Longsword' })).toBe('/packs/icons/media/sword.webp');
    expect(attackArt({ ...attack('melee'), name: 'Bite' })).toBe('/art/icons/actions/melee-attack.webp');
  });

  it('shows a condition, or the spell an effect came from', () => {
    setPackArt({ condition: { prone: pic('prone') }, spell: { bless: pic('bless') } });
    expect(effectArt({ conditions: ['prone'] })).toBe('/packs/icons/media/prone.webp');
    expect(effectArt({ name: 'Bless' })).toBe('/packs/icons/media/bless.webp');
    expect(effectArt({ name: 'Rage' })).toBeUndefined();
  });

  it('gives a monster its pack token, and a token’s pack art comes from where the server serves it', () => {
    setPackArt({ monster: { goblin: pic('goblin') } });
    expect(monsterArt({ id: 'goblin', img: '/art/tokens/goblin.webp' })).toBe('/packs/icons/media/goblin.webp');
    expect(monsterArt({ id: 'orc' })).toBeUndefined();
    expect(cutoutOf({ art: 'pack://icons/media/goblin.webp' } as TokenView)).toBe('/packs/icons/media/goblin.webp');
  });

  it('finds the animation for an attack or spell, else healing’s', () => {
    setPackArt({ animation: { 'melee:longsword': ['a.webm'], 'spell:fire-bolt': ['b.webm'], heal: ['h.webm'] } });
    expect(packAnimation('melee', 'Flame Tongue Longsword')).toEqual(['a.webm']);
    expect(packAnimation('ranged', 'Longsword')).toBeUndefined();
    expect(packAnimation('spell', 'fire-bolt')).toEqual(['b.webm']);
    expect(packAnimation('spell', 'cure-wounds', { heals: true })).toEqual(['h.webm']);
    expect(packAnimation('spell', 'cure-wounds')).toBeUndefined();
  });
});
