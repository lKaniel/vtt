import type { AttackLog, SpellLog } from '@vtt/system-dnd5e';
import { afterEach, describe, expect, it } from 'vitest';
import { setPackArt } from '../content/pack-art.ts';
import { attackLogIcon, spellLogIcon } from './log-icons.ts';

const attack = { attack: 'Longbow', kind: 'ranged', parts: [{ type: 'piercing' }] } as unknown as AttackLog;
const spell = { spell: 'Fire Bolt', spellId: 'fire-bolt', damageType: 'fire' } as unknown as SpellLog;

describe('icons on chat cards', () => {
  afterEach(() => setPackArt({}));

  it('shows an attack as its weapon, and a spell as its own icon', () => {
    expect(attackLogIcon(attack)).toMatchObject({ glyph: 'bow', art: '/art/icons/actions/ranged-attack.webp' });
    expect(spellLogIcon(spell)).toMatchObject({
      glyph: 'flame',
      tint: 'fire',
      art: '/art/icons/spells/fire-bolt.webp',
    });
  });

  it('uses the game’s pack art when there is some', () => {
    setPackArt({ item: { longbow: ['pack://i/bow.webp'] }, spell: { 'fire-bolt': ['pack://i/fb.webp'] } });
    expect(attackLogIcon(attack).art).toBe('/packs/i/bow.webp');
    expect(spellLogIcon(spell).art).toBe('/packs/i/fb.webp');
  });

  it('draws a spell it does not know by its damage', () => {
    const homebrew = { spell: 'Hex Bolt', spellId: 'hex-bolt', damageType: 'necrotic' } as unknown as SpellLog;
    expect(spellLogIcon(homebrew)).toEqual({ glyph: 'skull', tint: 'necrotic' });
  });
});
