import type { Spell, SpellTargetLog, TokenView } from '@vtt/shared';

// Words for spells and features: tooltips, chat lines and preview labels.

export const ORDINAL = ['Cantrip', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

/** The lowest slot level with a slot left that can cast `spell`; 0 for cantrips, undefined when none is left. */
export function lowestSlot(token: TokenView, spell: Spell): number | undefined {
  if (spell.level === 0) return 0;
  const left = token.sheet?.caster?.left ?? [];
  const i = left.findIndex((n, idx) => idx + 1 >= spell.level && n > 0);
  return i < 0 ? undefined : i + 1;
}

function attackText(r: SpellTargetLog): string {
  if (r.hit === undefined) return '';
  let verdict = r.hit ? 'hit' : 'miss';
  if (r.crit) verdict = 'critical hit';
  return `${r.attack?.total ?? ''} ${verdict}`;
}

function saveText(r: SpellTargetLog): string {
  const s = r.save;
  if (!s) return '';
  const result = s.success ? 'saved' : 'failed';
  return `${s.ability.toUpperCase()} save ${s.total} vs DC ${s.dc}, ${result}`;
}

/** "Goblin: 18 hit · 7 damage", "Orc: DEX save 16 vs DC 15, saved · 4 damage". */
export function targetText(r: SpellTargetLog): string {
  if (r.immune) return `${r.target}: unaffected`;
  const parts = [
    attackText(r),
    saveText(r),
    r.damage ? `${r.damage} damage` : '',
    r.healed === undefined ? '' : `heals ${r.healed}`,
    r.effect ?? '',
  ];
  return `${r.target}: ${parts.filter(Boolean).join(' · ') || 'affected'}`;
}

/** "Bless · 1/3 · 25 ft", with a warning when out of range or blocked. */
export function previewLabel(p: {
  name: string;
  count?: string;
  feet: number;
  reach: number;
  blocked: boolean;
}): string {
  const parts = [p.name];
  if (p.count) parts.push(p.count);
  if (p.reach > 0) parts.push(`${p.feet} ft`);
  if (p.blocked) parts.push('no clear path');
  else if (p.reach > 0 && p.feet > Math.max(5, p.reach) + 2.5) parts.push('out of range');
  return parts.join(' · ');
}
