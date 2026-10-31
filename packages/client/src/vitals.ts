import type { EffectTemplate, Health, TokenView } from '@vtt/shared';

// Health bars and effect tones for the party, turn order and sheet.

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

function hpLabel(hp: number, sheet: NonNullable<TokenView['sheet']>): string {
  return sheet.tempHp ? `${hp}/${sheet.maxHp} +${sheet.tempHp}` : `${hp}/${sheet.maxHp}`;
}

function deathLabel(saves: NonNullable<TokenView['deathSaves']>): string {
  if (saves.dead || saves.failures >= 3) return 'Dead';
  if (saves.stable) return 'Stable';
  return `Dying: ${saves.successes} ✓ ${saves.failures} ✗`;
}

export function hpBar(token: TokenView): HpBar | undefined {
  const sheet = token.sheet;
  if (sheet) {
    const hp = Math.max(0, sheet.hp);
    return {
      percent: Math.round((hp / sheet.maxHp) * 100),
      tone: toneOf(hp, sheet.maxHp),
      label: hp === 0 && token.deathSaves ? deathLabel(token.deathSaves) : hpLabel(hp, sheet),
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
