import { formChoices, type Spell, type TokenView } from '@vtt/system-dnd5e';
import { contentFor } from '../content/content.ts';
import { slotChoices } from '../play/charges.ts';
import { itemSlots } from '../play/item-spells.ts';
import { t } from '../i18n/index.ts';
import type { Session } from '../session/session.ts';
import { ORDINAL } from '../text/spell-text.ts';
import type { Aiming } from '../play/targeting.ts';
import { Button } from './kit/button.tsx';
import { SelectField } from './kit/select.tsx';
import { Toggle } from './kit/toggle.tsx';
import { PowerControls } from './PowerControls.tsx';

// The bar shown while a spell is aimed: its slot, what it summons, its option.

/** While a spell is aimed: which slot to cast it with, what to summon, its option, and casting with fewer targets. */
export function AimingControls({ session, token }: Readonly<{ session: Session; token: TokenView }>) {
  const aiming = session.actions.aiming;
  if (!aiming) return null;
  const { spell } = aiming;
  return (
    <div className="aiming frame">
      <span className="aiming-name">{spell.name}</span>
      {aiming.scroll && <span className="muted">from a scroll</span>}
      {aiming.item !== undefined && <ItemSlots session={session} aiming={aiming} token={token} />}
      {spell.level > 0 && !aiming.scroll && aiming.item === undefined && token.sheet?.caster && (
        <SlotChoices session={session} aiming={aiming} caster={token.sheet.caster} />
      )}
      <SpellOptions session={session} aiming={aiming} />
      {aiming.power ? (
        <PowerControls session={session} aiming={aiming} />
      ) : (
        <CastAt session={session} aiming={aiming} />
      )}
      {spell.transform && <FormChoice session={session} aiming={aiming} token={token} />}
    </div>
  );
}

/** Casts a spell aimed at creatures with the ones picked so far. */
function CastAt({ session, aiming }: Readonly<{ session: Session; aiming: Aiming }>) {
  if (aiming.mode !== 'creatures' || !aiming.picks.length) return null;
  return (
    <Button size="sm" onClick={() => session.actions.confirmCast()}>
      Cast at {aiming.picks.length}
    </Button>
  );
}

/** What the aimed spell summons, and its option (a damage type, enlarge or reduce). */
function SpellOptions({ session, aiming }: Readonly<{ session: Session; aiming: Aiming }>) {
  const spell: Spell = aiming.spell;
  return (
    <>
      {spell.summon && (
        <SelectField
          value={aiming.summon ?? ''}
          aria-label="What to summon"
          onValueChange={(m) => session.actions.chooseSummon(m)}
          options={spell.summon.options.map((o) => ({ value: o.monster, label: summonLabel(o) }))}
        />
      )}
      {spell.choices && (
        <SelectField
          value={aiming.choice ?? ''}
          aria-label={`${spell.name} option`}
          onValueChange={(c) => session.actions.chooseOption(c)}
          options={spell.choices.map((c) => ({ value: c.id, label: c.name }))}
        />
      )}
    </>
  );
}

/** The creature a shape-shifting spell (polymorph) turns its targets into. */
function FormChoice({ session, aiming, token }: Readonly<{ session: Session; aiming: Aiming; token: TokenView }>) {
  const content = contentFor(token);
  const forms = formChoices(aiming.spell, content, token.sheet?.caster?.level ?? 1);
  return (
    <SelectField
      value={aiming.form ?? ''}
      aria-label="Form"
      onValueChange={(m) => session.actions.chooseForm(m)}
      options={forms.map((m) => ({ value: m.id, label: `${m.name} (CR ${m.cr})` }))}
    />
  );
}

/** The slot levels a spell can be cast with, how many of each are left, and casting it for free. */
function SlotChoices({
  session,
  aiming,
  caster,
}: Readonly<{ session: Session; aiming: Aiming; caster: { slots: number[]; left: number[] } }>) {
  const { spell, free } = aiming;
  const choices = slotChoices(spell, caster).filter((c) => free === true || c.left > 0);
  const backToSlots = () => {
    session.actions.setFreeCast(false);
    const current = choices.find((c) => c.level === aiming.slot);
    const first = choices.find((c) => c.left > 0);
    if (!current?.left && first) session.actions.aim(spell.id, first.level);
  };
  return (
    <span className="slot-choices" role="group" aria-label="Spell slot">
      <span className="slot-choices-label">Slot</span>
      {choices.map((c) => (
        <Toggle
          key={c.level}
          pressed={c.level === aiming.slot}
          onPressedChange={() => session.actions.aim(spell.id, c.level, free)}
          title={free ? `Cast at ${ORDINAL[c.level]} level for free` : `Use a ${ORDINAL[c.level]}-level slot`}
        >
          {ORDINAL[c.level]}
          {!free && <span className="slot-chip-left">{`${c.left}/${c.total}`}</span>}
        </Toggle>
      ))}
      <Toggle
        pressed={free}
        onPressedChange={() => (free ? backToSlots() : session.actions.setFreeCast(true))}
        title="Cast without spending a spell slot"
      >
        Free
      </Toggle>
    </span>
  );
}

/** The levels a wand or staff can cast its spell at, more charges for each level up. */
function ItemSlots({ session, aiming, token }: Readonly<{ session: Session; aiming: Aiming; token: TokenView }>) {
  const index = aiming.item!;
  const item = contentFor(token).items.get(token.inventory?.[index]?.item ?? '');
  const levels = itemSlots(token, index, aiming.spell.id);
  return (
    <span className="slot-choices" role="group" aria-label={t('item.castLevel')}>
      <span className="muted">{t('item.castFrom', { item: item?.name ?? '' })}</span>
      {levels.length > 1 &&
        levels.map((level) => (
          <Toggle
            key={level}
            pressed={level === aiming.slot}
            onPressedChange={() => session.actions.aimItem(index, aiming.spell.id, level)}
          >
            {ORDINAL[level]}
          </Toggle>
        ))}
    </span>
  );
}

type SummonOption = NonNullable<Spell['summon']>['options'][number];

/** "2 × dire-wolf", or a spell creature's own name (how many it brings depends on the slot and size). */
function summonLabel(o: SummonOption): string {
  const name = o.creature?.name ?? o.monster;
  const fixed = o.count > 1 && !o.fromMod && (o.weight ?? 1) === 1;
  return fixed ? `${o.count} × ${name}` : name;
}
