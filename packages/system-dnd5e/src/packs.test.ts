import type { PackCompendium } from '@vtt/core';
import { describe, expect, it } from 'vitest';
import { contentWith, dnd5e, packContentIssues, srdFor, SRD_PACKS } from './index.ts';

const goblinBoss = {
  id: 'goblin-warlord',
  name: 'Goblin Warlord',
  ac: 17,
  hp: 45,
  darkvision: 60,
  abilities: { str: 12, dex: 16, con: 12, int: 10, wis: 10, cha: 14 },
  cr: 3,
  attacks: [],
};
const compendium = (extra: Partial<PackCompendium> = {}): PackCompendium => ({
  pack: 'goblins',
  id: 'monsters',
  type: 'monster',
  path: 'monsters.json',
  docs: [goblinBoss],
  ...extra,
});

describe('the SRD as packs', () => {
  it('ships one pack per edition, holding its monsters, items and spells', () => {
    expect(SRD_PACKS.map((p) => p.manifest.id)).toEqual(['dnd5e-srd-2014', 'dnd5e-srd-2024']);
    expect(dnd5e.packs).toBe(SRD_PACKS);
    const pack2024 = SRD_PACKS[1]!;
    expect(pack2024.manifest).toMatchObject({ system: 'dnd5e', license: 'CC-BY-4.0' });
    expect(pack2024.manifest.compendia.map((c) => [c.type, c.rules])).toEqual([
      ['monster', '2024'],
      ['item', '2024'],
      ['spell', '2024'],
    ]);
    expect(pack2024.compendium('monsters')).toHaveLength(srdFor('2024').monsters.size);
    expect(pack2024.compendium('nope')).toEqual([]);
  });
});

describe('content from packs', () => {
  it('adds the monsters, items and spells of a game’s packs to the SRD', () => {
    const content = contentWith('2014', [compendium()]);
    expect(content.monsters.get('goblin-warlord')?.name).toBe('Goblin Warlord');
    expect(content.monsters.get('goblin')).toBe(srdFor('2014').monsters.get('goblin'));
    expect(contentWith('2014', [])).toBe(srdFor('2014'));
  });

  it('leaves out compendia for the other edition, and documents that are no monster', () => {
    expect(contentWith('2024', [compendium({ rules: '2014' })]).monsters.has('goblin-warlord')).toBe(false);
    const broken = contentWith('2014', [compendium({ docs: [{ id: 'blob' }, goblinBoss] })]);
    expect(broken.monsters.has('blob')).toBe(false);
    expect(broken.monsters.has('goblin-warlord')).toBe(true);
  });

  it('is worked out once for the same packs', () => {
    const packs = [compendium()];
    expect(contentWith('2014', packs)).toBe(contentWith('2014', packs));
  });

  it('names the documents that are not what their compendium says', () => {
    expect(packContentIssues(compendium({ docs: [goblinBoss, { id: 'blob' }] }))).toEqual([
      expect.stringMatching(/^monsters #2 \(blob\): /),
    ]);
    expect(packContentIssues(compendium({ type: 'scene' }))).toEqual([]);
  });

  it('lets tokens refer to pack content', () => {
    const token = dnd5e.tokenSchema.parse({ id: 'w', name: 'Warlord', x: 50, y: 50, monster: 'goblin-warlord' });
    expect(dnd5e.tokenIssues(token, '2014')).toHaveLength(1);
    expect(dnd5e.tokenIssues(token, '2014', [compendium()])).toEqual([]);
    expect(dnd5e.perceiver(token, '2014', [compendium()]).senses.darkvision).toBe(60);
  });
});
