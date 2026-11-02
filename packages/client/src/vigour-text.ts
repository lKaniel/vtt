import type { Edition, HitDice } from '@vtt/system-dnd5e';

// How the sheet words exhaustion and hit dice.

const STEPS_2014 = [
  'Disadvantage on checks',
  'speed halved',
  'disadvantage on attacks and saves',
  'hit point maximum halved',
  'speed 0',
];

/** What `level` levels of exhaustion do. */
export function exhaustionText(level: number, edition: Edition): string {
  if (!level) return 'Not exhausted';
  if (level >= 6) return 'Dead';
  if (edition === '2024') return `−${2 * level} to d20 tests · −${5 * level} ft speed`;
  return STEPS_2014.slice(0, level).join(' · ');
}

export function hitDiceText({ die, total, left }: HitDice): string {
  return `${left}/${total} d${die}`;
}
