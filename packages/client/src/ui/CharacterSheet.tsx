import {
  ABILITIES,
  abilityMod,
  actorFromToken,
  type Creature,
  type Edition,
  editionOf,
  type SheetArea,
  characterLevel,
  classesText,
} from '@vtt/system-dnd5e';
import { xpLine } from '../encounter-view.ts';
import { uniqueId } from '@vtt/shared';
import { useEffect, useRef, useState } from 'react';
import type { Session, SheetTarget } from '../session.ts';
import { listText, parseList, setAbility, setStat, tokenPatch } from '../token-edit.ts';
import { NumberInput } from './EditorFields.tsx';
import { EffectBadges, Face, HpBar } from './Portrait.tsx';
import { previewSheet, withKey, type Draft, type Update } from './sheet-model.ts';
import { Details } from './SheetDetails.tsx';
import { FeaturesPage, SpellsPage } from './SheetPages.tsx';
import { InventoryPage } from './InventoryPage.tsx';
import { EffectsPage } from './EffectsPage.tsx';
import { AnimationsPage } from './AnimationsPage.tsx';
import { useAutoSave } from './useAutoSave.ts';
import { sheetDropTarget } from './sheet-drop.ts';
import { Button } from './kit/button.tsx';
import { Input } from './kit/input.tsx';
import { Tabs, TabsList, TabsTrigger } from './kit/tabs.tsx';

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

const ABILITY_NAME = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
} as const;

const PAGES = ['Inventory', 'Spells', 'Features', 'Effects', 'Animations', 'Details'] as const;
type Page = (typeof PAGES)[number];
/** Where things dropped on a page (or its tab) go. */
const AREA: Partial<Record<Page, SheetArea>> = { Inventory: 'inventory', Spells: 'spells', Features: 'features' };

/** Everything a part of the sheet needs. */
export interface SheetProps {
  session: Session;
  kind: SheetTarget['kind'];
  value: Draft;
  update: Update;
  sheet: Creature;
  edit: boolean;
}

/**
 * BG3-style character window: abilities on the left, portrait and vitals in
 * the middle, gear, magic and details on the right. The GM can switch it to
 * edit mode, where every field saves itself.
 */
export function CharacterSheet({ session }: Readonly<{ session: Session }>) {
  const target = session.sheet;
  const live = target && (target.kind === 'token' ? session.tokens.get(target.id) : session.actors.get(target.id));
  if (!target || !live) return null;
  return <SheetWindow key={`${target.kind}:${target.id}`} session={session} target={target} live={live} />;
}

function SheetWindow({
  session,
  target,
  live,
}: Readonly<{ session: Session; target: SheetTarget & { edit: boolean }; live: Draft }>) {
  const liveRef = useRef(live);
  useEffect(() => {
    liveRef.current = live;
  });
  const { value, update } = useAutoSave<Draft>(live, (draft) => {
    if (target.kind === 'token') session.editToken(live.id, tokenPatch(liveRef.current, draft));
    else session.saveActor(draft);
  });
  const rules = editionOf(value, session.world ?? {});
  const sheet = sheetOf(session, target, live, previewSheet(value, rules));
  if (!sheet) return null;
  const props: SheetProps = { session, kind: target.kind, value, update, sheet, edit: target.edit };
  return (
    <section
      className={target.edit ? 'sheet frame editing' : 'sheet frame'}
      aria-label={`${value.name}'s character sheet`}
      {...sheetDropTarget(session)}
    >
      <SheetHead {...props} />
      <div className="sheet-cols">
        <Abilities {...props} />
        <Hero {...props} />
        <Pages {...props} rules={rules} />
      </div>
      {target.edit && <SheetFoot {...props} />}
    </section>
  );
}

/** The stats shown: as the server sent them, or as edited; a plain token (no stats) shows only to the GM. */
function sheetOf(
  session: Session,
  target: SheetTarget & { edit: boolean },
  live: Draft,
  preview: Creature | undefined,
): Creature | undefined {
  if (live.sheet && !target.edit) return live.sheet;
  return target.kind === 'token' && !live.sheet && !session.isGm() ? undefined : preview;
}

function Pages(props: Readonly<SheetProps & { rules: Edition }>) {
  const [page, setPage] = useState<Page>('Inventory');
  const pages = PAGES.filter((p) => p !== 'Details' || props.edit);
  const shown = pages.includes(page) ? page : 'Inventory';
  return (
    <div className="sheet-page" data-area={AREA[shown]}>
      <Tabs value={shown} onValueChange={(p) => setPage(p as Page)}>
        <TabsList className="sheet-tabs mb-2">
          {pages.map((p) => (
            <TabsTrigger key={p} value={p} data-area={AREA[p]} onDragEnter={() => AREA[p] && setPage(p)}>
              {p}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {shown === 'Inventory' && <InventoryPage {...props} />}
      {shown === 'Spells' && <SpellsPage {...props} />}
      {shown === 'Features' && <FeaturesPage {...props} />}
      {shown === 'Effects' && <EffectsPage {...props} />}
      {shown === 'Animations' && <AnimationsPage {...props} />}
      {shown === 'Details' && <Details {...props} />}
    </div>
  );
}

function SheetHead({ session, kind, value, update, edit }: Readonly<SheetProps>) {
  const level = characterLevel(value.stats);
  const xp = xpLine(value.stats);
  const title = [
    level && `Level ${level}`,
    classesText(value.stats) ?? value.monster,
    xp && `· ${xp}`,
    kind === 'actor' && '(actor)',
  ]
    .filter(Boolean)
    .join(' ');
  const editable = kind === 'actor' ? session.isGm() : session.canEdit(value.id);
  return (
    <header className="sheet-head">
      <div>
        {edit ? (
          <Input
            className="sheet-name-input"
            value={value.name}
            aria-label="Name"
            onChange={(e) => update((d) => ({ ...d, name: e.target.value }))}
          />
        ) : (
          <h2>{value.name}</h2>
        )}
        <span className="sheet-sub">{title}</span>
      </div>
      <div className="sheet-head-tools">
        {editable && (
          <Button variant="outline" size="sm" onClick={() => session.setSheetEdit(!edit)} title="Edit mode (E)">
            {edit ? 'Done' : 'Edit'}
          </Button>
        )}
        <Button variant="close" onClick={() => session.openSheet(undefined)} aria-label="Close (C)" title="Close (C)" />
      </div>
    </header>
  );
}

function Abilities({ value, update, sheet, edit }: Readonly<SheetProps>) {
  return (
    <div className="sheet-abilities">
      {ABILITIES.map((a) => (
        <div key={a} className="ability" title={ABILITY_NAME[a]}>
          <span className="ability-name">{a.toUpperCase()}</span>
          <strong className="ability-mod">{signed(abilityMod(sheet.abilities[a]))}</strong>
          {edit ? (
            <NumberInput
              className="ability-score"
              value={value.stats?.abilities?.[a]}
              min={1}
              placeholder={sheet.abilities[a]}
              onChange={(v) => update((d) => setAbility(d, a, v))}
            />
          ) : (
            <span className="ability-score">{sheet.abilities[a]}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function Hero(props: Readonly<SheetProps>) {
  const { value, sheet, edit } = props;
  return (
    <div className="sheet-hero">
      <Face token={{ x: 0, y: 0, ...value }} className="hero-face" />
      {edit ? <HpEdit {...props} /> : <HpBar token={{ x: 0, y: 0, ...value, sheet }} />}
      <EffectBadges token={{ x: 0, y: 0, ...value }} />
      {edit ? <StatsEdit {...props} /> : <StatsView sheet={sheet} />}
      <Defenses {...props} />
    </div>
  );
}

function StatsView({ sheet }: Readonly<{ sheet: Creature }>) {
  return (
    <div className="sheet-stats">
      <Stat label="Armour" value={sheet.ac} />
      <Stat label="Speed" value={`${sheet.speed} ft`} />
      <Stat label="Initiative" value={signed(sheet.initiative)} />
      <Stat label="Proficiency" value={signed(sheet.proficiency)} />
    </div>
  );
}

function StatsEdit({ value, update, sheet }: Readonly<SheetProps>) {
  const stat = (key: 'ac' | 'proficiency') => (v: number | undefined) => update((d) => setStat(d, key, v));
  return (
    <div className="sheet-stats">
      <EditStat label="Armour">
        <NumberInput value={value.stats?.ac} placeholder={sheet.ac} onChange={stat('ac')} />
      </EditStat>
      <EditStat label="Speed">
        <NumberInput value={value.speed} min={0} onChange={(v) => update((d) => ({ ...d, speed: v ?? 30 }))} />
      </EditStat>
      <Stat label="Initiative" value={signed(sheet.initiative)} />
      <EditStat label="Proficiency">
        <NumberInput value={value.stats?.proficiency} placeholder={sheet.proficiency} onChange={stat('proficiency')} />
      </EditStat>
    </div>
  );
}

function Stat({ label, value }: Readonly<{ label: string; value: string | number }>) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EditStat({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <label className="stat stat-edit">
      {children}
      <span>{label}</span>
    </label>
  );
}

/** Hit points and maximum, plus quick damage and healing. */
function HpEdit({ value, update, sheet }: Readonly<SheetProps>) {
  const [amount, setAmount] = useState<number | undefined>();
  const apply = (sign: number) => {
    if (!amount) return;
    const hp = Math.min(sheet.maxHp, Math.max(0, (value.hp ?? sheet.maxHp) + sign * amount));
    update((d) => withKey(d, 'hp', hp >= sheet.maxHp ? undefined : hp), true);
    setAmount(undefined);
  };
  return (
    <div className="hp-edit">
      <label>
        <span>HP</span>
        <NumberInput
          value={value.hp}
          placeholder={`${sheet.maxHp}`}
          onChange={(v) => update((d) => withKey(d, 'hp', v))}
        />
      </label>
      <label>
        <span>Max</span>
        <NumberInput
          value={value.stats?.maxHp}
          min={1}
          placeholder={sheet.maxHp}
          onChange={(v) => update((d) => setStat(d, 'maxHp', v))}
        />
      </label>
      <NumberInput value={amount} min={0} onChange={setAmount} placeholder="±" />
      <Button variant="outline" size="sm" onClick={() => apply(-1)} title="Take damage">
        Hit
      </Button>
      <Button variant="outline" size="sm" onClick={() => apply(1)} title="Heal">
        Heal
      </Button>
    </div>
  );
}

const DEFENSES = [
  ['resistances', 'Resistant'],
  ['immunities', 'Immune'],
  ['vulnerabilities', 'Vulnerable'],
] as const;

function Defenses({ value, update, sheet, edit }: Readonly<SheetProps>) {
  const shown = DEFENSES.filter(([key]) => edit || sheet[key].length > 0);
  if (!shown.length) return null;
  return (
    <dl className="defenses">
      {shown.map(([key, label]) => (
        <div key={key}>
          <dt>{label}</dt>
          <dd>
            {edit ? (
              <Input
                key={listText(value.stats?.[key])}
                defaultValue={listText(value.stats?.[key])}
                placeholder={listText(sheet[key]) || 'e.g. fire, cold'}
                onBlur={(e) => update((d) => setStat(d, key, parseList(e.target.value)), true)}
              />
            ) : (
              sheet[key].join(', ')
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Edit mode: keep, place or delete what's on the sheet. */
function SheetFoot(props: Readonly<SheetProps>) {
  return (
    <footer className="sheet-foot">
      <span className="muted">Changes save as you type.</span>
      <span className="ed-spacer" />
      {props.session.isGm() && <GmFootButtons {...props} />}
    </footer>
  );
}

/**
 * A token's tie to its actor: a linked token shares the actor's hit points
 * and effects; an unlinked copy has its own, and can save its changes to the
 * actor or start over from it.
 */
function ActorLinkButtons({ session, id, linked }: Readonly<{ session: Session; id: string; linked: boolean }>) {
  const relink = (how: 'link' | 'unlink' | 'save' | 'reset') => session.relinkToken(id, how);
  if (linked) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => relink('unlink')}
        title="Shares its actor's hit points and effects; unlink to make it a copy with its own"
      >
        Unlink
      </Button>
    );
  }
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => relink('save')}
        title="Save this copy's stats, gear and looks to its actor (its wounds and name stay its own)"
      >
        Save to actor
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => relink('reset')}
        title="Start over from the actor, keeping only its name"
      >
        Reset
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => relink('link')}
        title="Share the actor's hit points and effects from now on"
      >
        Link
      </Button>
    </>
  );
}

/** Keeping, placing and deleting creatures is the GM's. */
function GmFootButtons({ session, kind, value }: Readonly<SheetProps>) {
  const [confirm, setConfirm] = useState(false);
  const remove = () => {
    if (!confirm) {
      setConfirm(true);
      return;
    }
    if (kind === 'token') session.deleteToken(value.id);
    else session.deleteActor(value.id);
    session.openSheet(undefined);
  };
  const saveAsActor = () => {
    const id = uniqueId(value.name, (x) => session.actors.has(x));
    session.saveActor(actorFromToken({ x: 0, y: 0, ...value }, id));
    session.showError(`Saved ${value.name} to the Actors list`);
  };
  const tokenButtons = value.actor ? (
    <ActorLinkButtons session={session} id={value.id} linked={value.linked === true} />
  ) : (
    <Button variant="outline" size="sm" onClick={saveAsActor} title="Keep a copy in the Actors list">
      Save as actor
    </Button>
  );
  return (
    <>
      {kind === 'token' ? (
        tokenButtons
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => session.spawn({ kind: 'actor', id: value.id }, session.viewCentre())}
        >
          Place on map
        </Button>
      )}
      <Button variant={confirm ? 'destructive' : 'outline'} size="sm" onClick={remove} onBlur={() => setConfirm(false)}>
        {confirm ? 'Really delete?' : 'Delete'}
      </Button>
    </>
  );
}
