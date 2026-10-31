import type { Attack, Damage, FeatureSheet, Item, Spell } from '@vtt/shared';
import { ORDINAL } from './spell-text.ts';

// What the hover card on an action tile says.

export interface Tip {
  title: string;
  subtitle: string;
  /** Short lines under the title: cost, range, damage, save. */
  facts: string[];
  body: string;
  warning?: string;
}

const COST: Record<string, string> = {
  action: 'Action',
  bonus: 'Bonus action',
  reaction: 'Reaction',
  minute: '1 minute',
  hour: '1 hour',
  free: 'Free',
};

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const damageText = (damage: Damage[]) => damage.map((d) => `${d.dice} ${d.type}`).join(' + ');

function spellRange(s: Spell): string {
  let range = `${s.range} ft`;
  if (s.range === 0) range = 'Self';
  else if (s.range === 5) range = 'Touch';
  if (!s.area) return range;
  return `${range} · ${s.area.size}-ft ${s.area.shape}`;
}

function spellSave(s: Spell): string | undefined {
  if (!s.save) return undefined;
  const half = s.save.onSave === 'half' ? ', half on success' : '';
  return `${s.save.ability.toUpperCase()} save${half}`;
}

/** SRD descriptions carry markdown emphasis; tooltips show plain text. */
export function plainText(markdown: string): string {
  return markdown.replace(/(\*{1,3}|_)(\S(?:.*?\S)?)\1/g, '$2');
}

export function spellTip(s: Spell): Tip {
  const subtitle = s.level ? `${ORDINAL[s.level]}-level ${s.school}` : `${capital(s.school)} cantrip`;
  const facts = [
    COST[s.castingTime]!,
    spellRange(s),
    s.attack && `${capital(s.attack)} spell attack`,
    s.damage.length > 0 && damageText(s.damage),
    s.heal && `Heals ${s.heal}`,
    spellSave(s),
    s.duration !== 'Instantaneous' && s.duration,
  ].filter((f): f is string => typeof f === 'string');
  const tip: Tip = { title: s.name, subtitle, facts, body: plainText(s.description) };
  return s.automated ? tip : { ...tip, warning: 'Not automated: the GM applies it' };
}

export function attackTip(a: Attack): Tip {
  const reach = a.kind === 'melee' ? `Reach ${a.reach ?? 5} ft` : `Range ${a.range?.join('/')} ft`;
  return {
    title: a.name,
    subtitle: `${capital(a.kind)} weapon attack`,
    facts: ['Action', `${signed(a.toHit)} to hit`, reach, damageText(a.damage)],
    body: '',
  };
}

export function featureTip(f: FeatureSheet): Tip {
  const rest = f.recharge === 'long' ? 'long rest' : 'short rest';
  const uses = f.max === undefined ? [] : [`${f.left}/${f.max} uses · ${rest}`];
  return {
    title: f.name,
    subtitle: 'Class feature',
    facts: [COST[f.action ?? 'free']!, ...uses],
    body: plainText(f.description),
  };
}

/** Weapons and armor can be worn; `id` names items missing from the SRD. */
export function itemTip(item: Item | undefined, id: string, equipped: boolean): Tip {
  if (!item) return { title: id, subtitle: 'item', facts: [], body: '' };
  const wearable = item.type !== 'gear';
  return {
    title: item.name,
    subtitle: equipped ? `${item.type} · equipped` : item.type,
    facts: wearable ? [equipped ? 'Click to unequip' : 'Click to equip'] : [],
    body: item.type === 'gear' ? plainText(item.description ?? '') : '',
  };
}
