import { formChoices, type Spell, type TokenView } from '@vtt/system-dnd5e';
import { contentFor } from '../content.ts';
import { slotChoices } from '../charges.ts';
import type { Session } from '../session.ts';
import { ORDINAL } from '../spell-text.ts';
import type { Aiming } from '../targeting.ts';
import { Button } from './kit/button.tsx';
import { SelectField } from './kit/select.tsx';
import { Toggle } from './kit/toggle.tsx';

// The bar shown while a spell is aimed: its slot, what it summons, its option.

/** While a spell is aimed: which slot to cast it with, what to summon, its option, and casting with fewer targets. */
export function AimingControls({ session, token }: Readonly<{ session: Session; token: TokenView }>) {
  const aiming = session.aiming;
  if (!aiming) return null;
  const { spell } = aiming;
  return (
    <div className="aiming frame">
      <span className="aiming-name">{spell.name}</span>
      {aiming.scroll && <span className="muted">from a scroll</span>}
      {spell.level > 0 && !aiming.scroll && token.sheet?.caster && (
        <SlotChoices session={session} aiming={aiming} caster={token.sheet.caster} />
      )}
      <SpellOptions session={session} aiming={aiming} />
      {spell.transform && <FormChoice session={session} aiming={aiming} token={token} />}
      {aiming.mode === 'creatures' && aiming.picks.length > 0 && (
        <Button size="sm" onClick={() => session.confirmCast()}>
          Cast at {aiming.picks.length}
        </Button>
      )}
    </div>
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
          onValueChange={(m) => session.chooseSummon(m)}
          options={spell.summon.options.map((o) => ({ value: o.monster, label: summonLabel(o) }))}
        />
      )}
      {spell.choices && (
        <SelectField
          value={aiming.choice ?? ''}
          aria-label={`${spell.name} option`}
          onValueChange={(c) => session.chooseOption(c)}
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
      onValueChange={(m) => session.chooseForm(m)}
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
    session.setFreeCast(false);
    const current = choices.find((c) => c.level === aiming.slot);
    const first = choices.find((c) => c.left > 0);
    if (!current?.left && first) session.aim(spell.id, first.level);
  };
  return (
    <span className="slot-choices" role="group" aria-label="Spell slot">
      <span className="slot-choices-label">Slot</span>
      {choices.map((c) => (
        <Toggle
          key={c.level}
          pressed={c.level === aiming.slot}
          onPressedChange={() => session.aim(spell.id, c.level, free)}
          title={free ? `Cast at ${ORDINAL[c.level]} level for free` : `Use a ${ORDINAL[c.level]}-level slot`}
        >
          {ORDINAL[c.level]}
          {!free && <span className="slot-chip-left">{`${c.left}/${c.total}`}</span>}
        </Toggle>
      ))}
      <Toggle
        pressed={free}
        onPressedChange={() => (free ? backToSlots() : session.setFreeCast(true))}
        title="Cast without spending a spell slot"
      >
        Free
      </Toggle>
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
