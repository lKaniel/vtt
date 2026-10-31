// Turns the species, backgrounds and class choices of an Open Character
// Format SRD pack into what the character creator needs. The packs describe
// these with a small expression language; we read only the parts a creator
// shows: bonuses, traits, skill picks and starting kits.

import { ofType, type Entry, type Pack } from './srd-convert.ts';

type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
const ABILITIES = new Set<string>(['str', 'dex', 'con', 'int', 'wis', 'cha']);

interface Effect {
  target: unknown;
  op: string;
  value: unknown;
}
interface Choice {
  id: string;
  pick?: number;
  when?: string;
  from?: { values?: string[]; type?: string; options?: { id: string; effects?: Effect[]; choices?: Choice[] }[] };
}
interface Change {
  type: string;
  entry?: { item: string; quantity?: number; equipped?: boolean };
  field?: string;
  by?: number;
}
interface KitOption {
  id: string;
  changes?: Change[];
}
interface Step {
  id: string;
  kind: string;
  when?: string;
  options?: KitOption[] | { content?: { type: string; where?: string } };
  changes?: Change[];
}
export type OriginEntry = Entry & { choices?: Choice[]; actions?: { id: string; steps: Step[] }[] };

export interface Trait {
  name: string;
  description: string;
}
export interface KitItem {
  item: string;
  qty: number;
  equipped: boolean;
}
export interface KitStep {
  id: string;
  prompt: string;
  when?: { step: string; option: string };
  options: { id: string; label: string; items: KitItem[] }[];
}
export interface GearItem {
  type: 'gear';
  id: string;
  name: string;
  weight: number;
}
export interface Origins {
  species: object[];
  backgrounds: object[];
  classes: object[];
  gear: GearItem[];
}

const bare = (ref: string) => ref.slice(ref.indexOf('.') + 1);

/** Converts one pack. `known` are the items we already have, so kits reuse their ids. */
export function convertOrigins(pack: Pack, known: { id: string; name: string }[]): Origins {
  const ctx = new Ctx(pack, known);
  return {
    species: [...ofType(pack, 'race'), ...ofType(pack, 'species')].map((e) => ctx.species(e as OriginEntry)),
    backgrounds: ofType(pack, 'background').map((e) => ctx.background(e as OriginEntry)),
    classes: ofType(pack, 'class').map((e) => ctx.classOptions(e as OriginEntry)),
    gear: [...ctx.gear.values()],
  };
}

class Ctx {
  readonly gear = new Map<string, GearItem>();
  private byName: Map<string, string>;
  private pack: Pack;
  private known: { id: string; name: string }[];

  constructor(pack: Pack, known: { id: string; name: string }[]) {
    this.pack = pack;
    this.known = known;
    this.byName = new Map(known.map((k) => [k.name.toLowerCase(), k.id]));
  }

  private text(id: string, key: 'name' | 'description' | 'prompt'): string {
    return this.pack.text[`${id}.${key}`] ?? '';
  }

  private name(id: string): string {
    return this.text(id, 'name') || bare(id);
  }

  private traits(e: Entry): Trait[] {
    return (e.grants ?? [])
      .filter((g) => g.item.startsWith('traits.'))
      .map((g) => ({ name: this.name(g.item), description: this.text(g.item, 'description') }));
  }

  /** The darkvision the entry or one of its traits grants, if any. */
  private darkvision(e: Entry): number | undefined {
    const own = [e, ...(e.grants ?? []).map((g) => this.pack.entries.get(g.item))];
    const ranges = own.flatMap((x) => (x?.effects ?? []).filter((f) => f.target === 'senses.darkvision'));
    return ranges.length ? Math.max(...ranges.map((r) => Number(r.value))) : undefined;
  }

  private base(e: Entry) {
    const darkvision = this.darkvision(e);
    return {
      id: bare(e.id),
      name: this.name(e.id),
      description: this.text(e.id, 'description'),
      bonuses: bonuses(e.effects ?? []),
      traits: this.traits(e),
      ...(darkvision ? { darkvision } : {}),
    };
  }

  species(e: OriginEntry): object {
    const f = e.fields ?? {};
    const { bonuses: fixed, darkvision, ...base } = this.base(e);
    const kind = e.type === 'race' ? 'subrace' : 'lineage';
    const parent = e.type === 'race' ? 'race' : 'species';
    const subspecies = ofType(this.pack, kind)
      .filter((s) => s.fields?.[parent] === e.id)
      .map((s) => this.base(s));
    const choice = bonusChoice(e.choices ?? [], fixed);
    return {
      ...base,
      sizes: f.size === 'choice' ? ['small', 'medium'] : [f.size],
      speed: f.speed,
      darkvision: darkvision ?? 0,
      bonuses: fixed,
      ...(choice ? { bonusChoice: choice } : {}),
      subspecies,
    };
  }

  background(e: OriginEntry): object {
    const feat = (e.grants ?? []).find((g) => g.item.startsWith('feats.'));
    const abilities = backgroundAbilities(e.choices ?? []);
    return {
      id: bare(e.id),
      name: this.name(e.id),
      description: this.text(e.id, 'description'),
      skills: grantedSkills(e.effects ?? []),
      ...(abilities ? { abilities } : {}),
      ...(feat ? { feat: { name: this.name(feat.item), description: this.text(feat.item, 'description') } } : {}),
      kit: this.kit(e),
    };
  }

  classOptions(e: OriginEntry): object {
    const skills = (e.choices ?? []).find((c) => c.id === 'skills');
    const sub = (e.choices ?? []).find((c) => c.from?.type === 'subclass');
    return {
      id: bare(e.id),
      skills: { pick: skills?.pick ?? 0, from: (skills?.from?.values ?? []).map(bare) },
      subclassLevel: Number(/>=\s*(\d+)/.exec(sub?.when ?? '')?.[1] ?? 3),
      subclasses: ofType(this.pack, 'subclass')
        .filter((s) => s.fields?.class === e.id)
        .map((s) => ({ id: bare(s.id), name: this.name(s.id), description: this.text(s.id, 'description') })),
      kit: this.kit(e),
    };
  }

  private kit(e: OriginEntry): KitStep[] {
    const steps = e.actions?.find((a) => a.id === 'kit')?.steps ?? [];
    return steps.filter((s) => s.kind === 'choice').map((s) => this.step(e.id, s));
  }

  private step(owner: string, s: Step): KitStep {
    const when = /steps\.(\w+)\.picked\s*==\s*'([^']+)'/.exec(s.when ?? '');
    const options = Array.isArray(s.options)
      ? s.options.map((o) => this.option(owner, o))
      : this.queryOptions(s.options?.content, s.changes ?? []);
    return {
      id: s.id,
      prompt: this.text(`${owner}.actions.kit.steps.${s.id}`, 'prompt'),
      ...(when ? { when: { step: when[1]!, option: when[2]! } } : {}),
      options,
    };
  }

  private option(owner: string, o: KitOption) {
    const items = (o.changes ?? []).map((c) => this.change(c)).filter((i): i is KitItem => !!i);
    const named = this.text(`${owner}.actions.kit.options.${o.id}`, 'name');
    const listed = this.label(items);
    // 2024 kits are named just "A", "B": spell out what's in them.
    const label = named.length > 1 ? named : [named, listed].filter(Boolean).join(': ') || o.id;
    return { id: o.id, label, items };
  }

  /** "Pick a martial weapon": one option per matching item. */
  private queryOptions(content: { type: string; where?: string } | undefined, changes: Change[]) {
    if (!content) return [];
    const categories = [...(content.where ?? '').matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
    const equipped = changes.some((c) => c.entry?.equipped);
    return ofType(this.pack, content.type)
      .filter((x) => categories.includes(String(x.fields?.category)))
      .map((x) => {
        const item = this.itemId(x.id);
        return { id: item, label: this.name(x.id), items: [{ item, qty: 1, equipped }] };
      });
  }

  private change(c: Change): KitItem | undefined {
    if (c.type === 'adjust' && c.field === 'coins.gp' && c.by) return this.coins(c.by);
    const entry = c.type === 'addItem' ? c.entry : undefined;
    const ref = entry && /^'(.+)'$/.exec(entry.item)?.[1];
    if (!entry || !ref) return undefined;
    return { item: this.itemId(ref), qty: entry.quantity ?? 1, equipped: entry.equipped ?? false };
  }

  private coins(qty: number): KitItem {
    this.gear.set('gp', { type: 'gear', id: 'gp', name: 'Gold piece', weight: 0.02 });
    return { item: 'gp', qty, equipped: false };
  }

  /** Our id for a pack item: an item we have by that name, or new gear. */
  private itemId(ref: string): string {
    const name = this.name(ref);
    const ours = this.byName.get(name.toLowerCase()) ?? this.known.find((k) => k.id === bare(ref))?.id;
    if (ours) return ours;
    const id = bare(ref);
    if (!this.gear.has(id)) {
      const weight = Number(this.pack.entries.get(ref)?.fields?.weight ?? 0);
      this.gear.set(id, { type: 'gear', id, name, weight });
    }
    return id;
  }

  private label(items: KitItem[]): string {
    return items.map((i) => (i.item === 'gp' ? `${i.qty} gp` : this.itemLabel(i))).join(', ');
  }

  private itemLabel(i: KitItem): string {
    const name = this.gear.get(i.item)?.name ?? this.known.find((k) => k.id === i.item)?.name ?? i.item;
    return i.qty > 1 ? `${name} ×${i.qty}` : name;
  }
}

function bonuses(effects: Effect[]): Partial<Record<Ability, number>> {
  const out: Partial<Record<Ability, number>> = {};
  for (const e of effects) {
    const ability = /^abilities\.(\w+)\.base$/.exec(String(e.target))?.[1];
    if (e.op === 'add' && ability && ABILITIES.has(ability)) out[ability as Ability] = Number(e.value);
  }
  return out;
}

/** Half-elf style "+1 to two other abilities". */
function bonusChoice(choices: Choice[], fixed: Partial<Record<Ability, number>>) {
  const choice = choices.find((c) => c.pick && c.from?.options?.every((o) => ABILITIES.has(o.id)));
  if (!choice?.from?.options) return undefined;
  const amount = Number(choice.from.options[0]?.effects?.[0]?.value ?? 1);
  const from = choice.from.options.map((o) => o.id).filter((a) => !(a in fixed));
  return { count: choice.pick, amount, from };
}

/** The three abilities a 2024 background raises. */
function backgroundAbilities(choices: Choice[]): string[] | undefined {
  const increase = choices.find((c) => c.id === 'ability-increase');
  const values = increase?.from?.options?.flatMap((o) => o.choices ?? []).find((c) => c.from?.values)?.from?.values;
  return values?.filter((v) => ABILITIES.has(v));
}

function grantedSkills(effects: Effect[]): string[] {
  return effects
    .filter((e) => e.target === 'proficiencies.skills' && e.op === 'grant')
    .map((e) => (e.value as { tag?: string }).tag ?? '')
    .filter((t) => t.startsWith('skill.'))
    .map(bare);
}
