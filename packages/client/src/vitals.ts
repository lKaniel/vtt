import type { EffectTemplate, Health, TokenView } from '@vtt/shared';

// Health bars, effect tones and portrait initials for the party, turn order and sheet.

export interface HpBar {
  percent: number;
  tone: Health;
  /** "15/20" when you can see the sheet, else how hurt it looks. */
  label: string;
}

/** Roughly how full the bar looks for creatures you only see the health of. */
const LOOKS: Record<Health, number> = { unhurt: 100, hurt: 70, bloodied: 35, down: 0 };
const LOOKS_LABEL: Record<Health, string> = { unhurt: 'Unhurt', hurt: 'Hurt', bloodied: 'Bloodied', down: 'Down' };

function toneOf(hp: number, maxHp: number): Health {
  if (hp <= 0) return 'down';
  if (hp >= maxHp) return 'unhurt';
  return hp <= maxHp / 2 ? 'bloodied' : 'hurt';
}

export function hpBar(token: TokenView): HpBar | undefined {
  const sheet = token.sheet;
  if (sheet) {
    const hp = Math.max(0, sheet.hp);
    return {
      percent: Math.round((hp / sheet.maxHp) * 100),
      tone: toneOf(hp, sheet.maxHp),
      label: `${hp}/${sheet.maxHp}`,
    };
  }
  if (!token.health) return undefined;
  return { percent: LOOKS[token.health], tone: token.health, label: LOOKS_LABEL[token.health] };
}

function negative(dice: string | undefined): boolean {
  return dice?.trim().startsWith('-') ?? false;
}

/** Conditions, penalties and anything that helps enemies is harmful; the rest helps. */
export function effectTone(e: EffectTemplate): 'helpful' | 'harmful' {
  const harmful =
    !!e.conditions?.length ||
    negative(e.attackBonus) ||
    negative(e.saveBonus) ||
    (e.ac ?? 0) < 0 ||
    (e.speed ?? 0) < 0 ||
    !!e.advantageAgainst ||
    !!e.disadvantage;
  return harmful ? 'harmful' : 'helpful';
}

/** "Bram Stoutbeard" → "BS", "Orrin" → "Or". */
export function initials(name: string): string {
  const words = name.split(/\s+/).filter((w) => /^\p{L}/u.test(w));
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return name.slice(0, 2);
}
