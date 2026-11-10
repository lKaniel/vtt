import type { Monster } from '@vtt/system-dnd5e';
import { t } from '../i18n/index.ts';
import type { MessageKey } from '../i18n/en.ts';

// A monster's stat block lines in words, for its sheet.

export interface StatBlockLine {
  id: 'speeds' | 'languages' | 'alignment' | 'multiattack';
  text: string;
}

const SPEEDS = ['burrow', 'climb', 'fly', 'swim'] as const;
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function speedsText(speeds: NonNullable<Monster['speeds']>): string {
  const parts = SPEEDS.flatMap((kind) => {
    const feet = speeds[kind];
    if (!feet) return [];
    const hover = kind === 'fly' && speeds.hover ? ` ${t('sheet.speed.hover')}` : '';
    const name = t(`sheet.speed.${kind}` as MessageKey);
    return [`${name} ${t('sheet.feet', { n: feet })}${hover}`];
  });
  return capital(parts.join(', '));
}

/** The lines a stat block has besides its numbers: other speeds, languages, alignment, attacks per Multiattack. */
export function statBlockLines(
  monster: Pick<Monster, 'speeds' | 'languages' | 'alignment' | 'multiattack'> | undefined,
): StatBlockLine[] {
  if (!monster) return [];
  const lines: (StatBlockLine | undefined)[] = [
    monster.speeds && { id: 'speeds', text: speedsText(monster.speeds) },
    monster.languages?.length ? { id: 'languages', text: monster.languages.join(', ') } : undefined,
    monster.alignment ? { id: 'alignment', text: capital(monster.alignment) } : undefined,
    monster.multiattack ? { id: 'multiattack', text: String(monster.multiattack) } : undefined,
  ];
  return lines.filter((l): l is StatBlockLine => !!l && l.text !== '');
}

/** "Recharge 5–6": the d6 rolls that bring a spent action back. */
export function rechargeText(on: number): string {
  return t('sheet.rechargeOn', { roll: on >= 6 ? '6' : `${on}–6` });
}

const FRACTIONS: Record<number, string> = { 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' };

/** "Goblin · humanoid · CR 1/4": what a creature built on a stat block is, under its name. */
export function monsterLine(monster: Pick<Monster, 'name' | 'type' | 'cr'> | undefined): string {
  if (!monster) return '';
  const cr = t('sheet.cr', { cr: FRACTIONS[monster.cr] ?? String(monster.cr) });
  return [monster.name, monster.type, cr].filter(Boolean).join(' · ');
}
