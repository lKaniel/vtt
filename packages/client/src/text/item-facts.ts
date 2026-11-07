import { changeText, type EffectTemplate, type Item, type ItemCast } from '@vtt/system-dnd5e';
import { gameContent } from '../content/content.ts';
import { t } from '../i18n/index.ts';

// What an item does, in a few words for its tooltip: a magic weapon's +1 and
// extra damage, a worn item's effect, what drinking or reading it does.

const signed = (n: number) => (n < 0 ? String(n) : `+${n}`);
const plusDice = (d: string) => (d.startsWith('-') ? d : `+${d}`);

const TIME: [number, string][] = [
  [14400, 'day'],
  [600, 'hour'],
  [10, 'minute'],
  [1, 'round'],
];

/** 600 rounds is "1 hour", 100 is "10 minutes". */
function timeText(rounds: number): string {
  const [per, unit] = TIME.find(([n]) => rounds % n === 0)!;
  const n = rounds / per;
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

function weaponFacts(item: Item): string[] {
  if (item.type !== 'weapon') return [];
  const plus = item.plus ? [t('item.plus', { n: signed(item.plus) })] : [];
  const riders = (item.hitDamage ?? []).map((r) =>
    r.vs
      ? t('item.hitVs', { dice: plusDice(r.dice), type: r.type, vs: r.vs.join(' or ') })
      : t('item.hit', { dice: plusDice(r.dice), type: r.type }),
  );
  return [...plus, ...riders];
}

function bonusFacts(item: Item): string[] {
  const b = item.bonus ?? {};
  const ammo = item.type === 'gear' && item.plus ? [t('item.plus', { n: signed(item.plus) })] : [];
  return [
    ...ammo,
    ...(b.ac ? [t('item.ac', { n: signed(b.ac) })] : []),
    ...(b.saves ? [t('item.saves', { n: signed(b.saves) })] : []),
    ...(b.spellAttack ? [t('item.spellAttack', { n: signed(b.spellAttack) })] : []),
    ...(b.spellDc ? [t('item.spellDc', { n: signed(b.spellDc) })] : []),
  ];
}

function moveFacts(e: EffectTemplate): string[] {
  const out = [
    ...(e.speed ? [t('item.speed', { n: signed(e.speed) })] : []),
    ...(e.speedTimes ? [t('item.speedTimes', { n: e.speedTimes })] : []),
  ];
  for (const kind of ['fly', 'swim', 'climb'] as const) {
    const v = e.speeds?.[kind];
    const name = kind[0]!.toUpperCase() + kind.slice(1);
    if (v === 'walk') out.push(t('item.moves.walk', { kind: name }));
    else if (v !== undefined) out.push(t('item.moves', { kind: name, n: v }));
  }
  return e.speeds?.hover ? [...out, t('item.hover')] : out;
}

function senseFacts(e: EffectTemplate): string[] {
  return Object.entries(e.senses ?? {}).flatMap(([sense, n]) =>
    typeof n === 'number' ? [t('item.sense', { sense: sense[0]!.toUpperCase() + sense.slice(1), n })] : [],
  );
}

function rollFacts(e: EffectTemplate): string[] {
  return [
    ...(e.attackBonus ? [t('item.dice', { dice: plusDice(e.attackBonus), what: 'attacks' })] : []),
    ...(e.saveBonus ? [t('item.dice', { dice: plusDice(e.saveBonus), what: 'saves' })] : []),
    ...(e.checkBonus ? [t('item.dice', { dice: plusDice(e.checkBonus), what: 'ability checks' })] : []),
    ...(e.checkAdvantageFor?.length ? [t('item.advantage', { what: e.checkAdvantageFor.join(', ') })] : []),
    ...(e.saveAdvantage?.length
      ? [t('item.saveAdvantage', { abilities: e.saveAdvantage.map((a) => a.toUpperCase()).join(', ') })]
      : []),
    ...(e.spellSaveAdvantage ? [t('item.spellSaves')] : []),
  ];
}

/** What an effect does to its bearer, a few words each. */
function effectFacts(e: EffectTemplate | undefined): string[] {
  if (!e) return [];
  return [
    ...(e.ac ? [t('item.ac', { n: signed(e.ac) })] : []),
    ...(e.changes ?? []).map(changeText),
    ...(e.resistances?.length ? [t('item.resists', { types: e.resistances.join(', ') })] : []),
    ...(e.immunities?.length ? [t('item.immune', { types: e.immunities.join(', ') })] : []),
    ...(e.conditions ?? []).map((c) => c[0]!.toUpperCase() + c.slice(1)),
    ...moveFacts(e),
    ...senseFacts(e),
    ...rollFacts(e),
    ...(e.noCrits ? [t('item.noCrits')] : []),
    ...(e.disadvantageAgainst ? [t('item.attackersDisadvantage')] : []),
  ];
}

function usedFacts(item: Item): string[] {
  const use = item.type === 'gear' ? item.use : undefined;
  if (!use) return [];
  const effect = use.effect;
  return [
    ...(use.heal ? [t('item.heal', { dice: use.heal })] : []),
    ...(use.tempHp ? [t('item.tempHp', { n: use.tempHp })] : []),
    ...(use.raise ? [t('item.raise', { ability: use.raise.ability.toUpperCase(), n: use.raise.by })] : []),
    ...effectFacts(effect),
    ...(effect?.rounds ? [t('item.lasts', { time: timeText(effect.rounds) })] : []),
  ];
}

function attuneFacts(item: Item): string[] {
  if (!item.attunement) return [];
  return [item.attunedBy?.length ? t('item.attuneBy', { classes: item.attunedBy.join(' or ') }) : t('item.attune')];
}

const ORDINAL = ['cantrip', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

/** What one cast from the item costs: "at will", "once a day", "2 charges". */
function costText(cast: ItemCast, level: number): string {
  if (cast.daily) return t('item.cost.daily');
  if (cast.cost === 0) return t('item.cost.free');
  if (cast.cost !== 'level') return t('item.cost.charges', { n: cast.cost ?? 1 });
  if (!cast.less) return t('item.cost.level');
  return t('item.cost.less', { level: ORDINAL[Math.max(level, cast.less + 1)] ?? '' });
}

function castFacts(item: Item, rules: '2014' | '2024'): string[] {
  const spells = gameContent(rules).spells;
  const casts = (item.casts ?? []).map((c) => {
    const spell = spells.get(c.spell);
    return t('item.casts', { spell: spell?.name ?? c.spell, cost: costText(c, c.level ?? spell?.level ?? 1) });
  });
  const charges = item.charges;
  const left = charges
    ? [
        charges.recharge
          ? t('item.charges', { n: charges.max, dice: charges.recharge })
          : t('item.chargesNoRecharge', { n: charges.max }),
      ]
    : [];
  return [...casts, ...left, ...(item.dc !== undefined ? [t('item.dc', { n: item.dc })] : [])];
}

/** Everything the item does that the engine runs, a few words each. */
export function itemFacts(item: Item, rules: '2014' | '2024' = '2014'): string[] {
  return [
    ...attuneFacts(item),
    ...weaponFacts(item),
    ...bonusFacts(item),
    ...effectFacts(item.effect),
    ...usedFacts(item),
    ...castFacts(item, rules),
  ];
}

/** What the GM runs by hand about the item, if anything. */
export function itemNote(item: Item): string | undefined {
  if (item.manual) return t('item.gm', { why: item.manual.why });
  return item.gmNote;
}
