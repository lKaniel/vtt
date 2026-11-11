import {
  type ClientMessage,
  type FeatureSheet,
  formChoices,
  hitFinishers,
  momentumDice,
  type Spell,
  type TokenView,
} from '@vtt/system-dnd5e';
import { contentFor } from '../content/content.ts';
import { t } from '../i18n/index.ts';
import { ORDINAL } from '../text/spell-text.ts';

// The picks an action has besides its roll, which the bars over the action
// bar ask for when the roll dialog is off (a pool feature's options and
// numbers, a spell's summon, option or form, a smite or a finisher on an
// attack). With the dialog on they are asked in it, so there is one step.

type Asked = Extract<ClientMessage, { t: 'attack' | 'cast' | 'feature' | 'rollCheck' }>;
type Message<K extends Asked['t']> = Extract<Asked, { t: K }>;

/** One of several, any of several, or a number. */
export type ExtraValue = string | string[] | number;

export interface Extra {
  id: string;
  label: string;
  kind: 'one' | 'any' | 'number';
  options?: { value: string; label: string; hint?: string }[];
  /** A `one` that may be left out: '' stands for none. */
  optional?: boolean;
  /** An `any` that keeps at least one. */
  required?: boolean;
  min?: number;
  /** What the action has as it stands. */
  value: ExtraValue;
  /** The action with this pick set to `value`. */
  set(msg: Asked, value: ExtraValue): Asked;
}

const text = (value: ExtraValue): string | undefined => (typeof value === 'string' && value ? value : undefined);

/** A pick of one that fills a field of the message; '' leaves the field out. */
function one(
  field: 'finisher' | 'summon' | 'choice' | 'form',
  at: Pick<Extra, 'label' | 'options' | 'optional'> & { value: string | undefined },
): Extra {
  return {
    ...at,
    id: field,
    kind: 'one',
    value: at.value ?? '',
    set: (msg, value) => ({ ...msg, [field]: text(value) }),
  };
}

/** Divine Smite on a melee hit (2014 paladin): the slot to spend, if any. */
function smite(msg: Message<'attack'>, token: TokenView): Extra[] {
  const sheet = token.sheet;
  const attack = sheet?.attacks.find((a) => a.name === msg.attack);
  const caster = sheet?.caster;
  if (attack?.kind !== 'melee' || !caster || !sheet.features.some((f) => f.id === 'divine-smite')) return [];
  const levels = caster.left.flatMap((left, i) => (left > 0 ? [i + 1] : []));
  if (!levels.length) return [];
  return [
    {
      id: 'smite',
      label: t('rolls.extra.smite'),
      kind: 'one',
      optional: true,
      options: levels.map((l) => ({
        value: `${l}`,
        label: `${ORDINAL[l]} (${caster.left[l - 1]}/${caster.slots[l - 1]})`,
      })),
      value: msg.smite ? `${msg.smite}` : '',
      set: (m, value) => ({ ...m, smite: text(value) ? Number(value) : undefined }),
    },
  ];
}

/** The finisher to spend momentum dice on if the attack hits. */
function finisher(msg: Message<'attack'>, token: TokenView): Extra[] {
  const sheet = token.sheet;
  const finishers = sheet ? hitFinishers(sheet) : [];
  if (!sheet || !momentumDice(sheet)?.dice || !finishers.length) return [];
  const options = finishers.map((f) => ({ value: f.id, label: f.name }));
  return [one('finisher', { label: t('finisher.label'), options, optional: true, value: msg.finisher })];
}

/** A spell's own picks: what it summons, its option, the form it gives. */
function spellExtras(msg: Message<'cast'>, token: TokenView, spell: Spell): Extra[] {
  const forms = spell.transform ? formChoices(spell, contentFor(token), token.sheet?.caster?.level ?? 1) : [];
  const summons = spell.summon?.options.map((o) => ({ value: o.monster, label: o.creature?.name ?? o.monster }));
  const choices = spell.choices?.map((c) => ({ value: c.id, label: c.name }));
  const formOptions = forms.map((m) => ({ value: m.id, label: `${m.name} (CR ${m.cr})` }));
  return [
    ...(summons ? [one('summon', { label: t('rolls.extra.summon'), options: summons, value: msg.summon })] : []),
    ...(choices ? [one('choice', { label: t('rolls.extra.option'), options: choices, value: msg.choice })] : []),
    ...(forms.length ? [one('form', { label: t('rolls.extra.form'), options: formOptions, value: msg.form })] : []),
  ];
}

/** A pool feature's option groups (senses, shapes) and the numbers it takes. */
function powerExtras(msg: Message<'feature'>, feature: FeatureSheet): Extra[] {
  const picked = msg.picks ?? [];
  const groups = (feature.options ?? []).map((g): Extra => {
    const ids = g.list.map((o) => o.id);
    const mine = picked.filter((p) => ids.includes(p));
    const single = g.pick === 'one';
    const others = (m: Message<'feature'>) => (m.picks ?? []).filter((p) => !ids.includes(p));
    return {
      id: `group-${g.id}`,
      label: g.name,
      kind: single ? 'one' : 'any',
      required: g.required,
      options: g.list.map((o) => ({ value: o.id, label: o.name, hint: o.note })),
      value: single ? (mine[0] ?? '') : mine,
      set: (m, value) => ({ ...m, picks: [...others(m as Message<'feature'>), ...[value].flat().map(String)] }),
    };
  });
  const inputs = (feature.inputs ?? []).map((i): Extra => ({
    id: `input-${i.id}`,
    label: i.name,
    kind: 'number',
    min: i.min,
    value: msg.inputs?.[i.id] ?? i.default,
    set: (m, value) => ({ ...m, inputs: { ...(m as Message<'feature'>).inputs, [i.id]: Number(value) } }),
  }));
  return [...groups, ...inputs];
}

/** A feature's picks: a pool feature's options and numbers, and the option of one aimed like a spell. */
function featureExtras(msg: Message<'feature'>, feature: FeatureSheet, spell: Spell | undefined): Extra[] {
  const choices = spell?.choices?.map((c) => ({ value: c.id, label: c.name }));
  const power = feature.cost !== undefined ? powerExtras(msg, feature) : [];
  const option = choices
    ? [one('choice', { label: t('rolls.extra.option'), options: choices, value: msg.choice })]
    : [];
  return [...power, ...option];
}

/** What comes with the action besides its roll. */
export const extras = {
  attack: (msg: Message<'attack'>, token: TokenView): Extra[] =>
    msg.target ? [...smite(msg, token), ...finisher(msg, token)] : [],
  cast: spellExtras,
  feature: featureExtras,
};

/** The action with every pick in `values` set. */
export function withExtras<M extends Asked>(msg: M, list: readonly Extra[], values: Record<string, ExtraValue>): M {
  const set = list.filter((e) => e.id in values).reduce<Asked>((m, e) => e.set(m, values[e.id]!), msg);
  return JSON.parse(JSON.stringify(set)) as M;
}
