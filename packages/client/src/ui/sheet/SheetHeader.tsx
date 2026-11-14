import { characterLevel, classesText, originsFor } from '@vtt/system-dnd5e';
import { ExternalLinkIcon, MoonIcon, TentIcon } from 'lucide-react';
import { t } from '../../i18n/index.ts';
import { monsterLine } from '../../text/monster-text.ts';
import { xpProgress } from '../../text/sheet-text.ts';
import { Button } from '../kit/button.tsx';
import { Input } from '../kit/input.tsx';
import { Switch } from '../kit/switch.tsx';
import type { SheetProps } from './sheet-props.ts';
import { LevelUpButton } from './LevelUpButton.tsx';
import { monsterOf } from './StatBlock.tsx';

/** What the sheet's header buttons do: the sheet over the map, or one in its own window (no pop-out). */
export interface SheetControls {
  setEdit: (edit: boolean) => void;
  close: () => void;
  popOut?: () => void;
}

/** Name and classes on the left; level, experience and rests on the right, and (in its own browser window) edit mode and close. */
export function SheetHeader(props: Readonly<SheetProps & { controls: SheetControls }>) {
  const { session, kind, value, edit, controls } = props;
  return (
    <header className="flex items-center gap-4 border-b border-gold-dim/50 px-5 pt-3 pb-2">
      <SheetTitle {...props} />
      <LevelUpButton {...props} />
      <LevelBadge {...props} />
      {kind === 'token' && session.hud.canOverride(value.id) && !edit && <RestButtons {...props} />}
      {!controls.popOut && <SheetButtons {...props} />}
    </header>
  );
}

/** Edit mode (for those who may edit it), pop out, and close when the sheet has no window round it to close it. */
export function SheetButtons(props: Readonly<SheetProps & { controls: SheetControls }>) {
  const { session, kind, value, edit, controls } = props;
  const editable = session.canEdit(value.id, kind);
  return (
    <div className="flex items-center gap-2">
      {kind === 'token' && session.isGm() && !value.pile && <LinkSwitch {...props} />}
      {editable && (
        <label
          className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground"
          title={t('sheet.editMode')}
        >
          {t('sheet.edit')}
          <Switch checked={edit} onCheckedChange={controls.setEdit} aria-label={t('sheet.editMode')} />
        </label>
      )}
      {controls.popOut ? (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={controls.popOut}
          title={t('sheet.popOut')}
          aria-label={t('sheet.popOut')}
        >
          <ExternalLinkIcon />
        </Button>
      ) : (
        <Button variant="close" onClick={controls.close} aria-label={t('sheet.close')} title={t('sheet.close')} />
      )}
    </div>
  );
}

/**
 * GM: the token's tie to its actor, as Foundry's "Link actor data". On, it
 * shares its actor's hit points and effects (a token without an actor gets a
 * new one); off, it is a copy with its own, starting as the actor is.
 */
function LinkSwitch({ session, value }: Readonly<SheetProps>) {
  const linked = !!value.actor && value.linked === true;
  const off = value.actor ? 'sheet.unlinkedHint' : 'sheet.noActorHint';
  const hint = t(linked ? 'sheet.linkedHint' : off);
  const on = value.actor ? 'link' : 'new';
  const toggle = (checked: boolean) => session.requests.relinkToken(value.id, checked ? on : 'unlink');
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground" title={hint}>
      {t('sheet.linked')}
      <Switch checked={linked} onCheckedChange={toggle} aria-label={t('sheet.linkedLabel')} />
    </label>
  );
}

function SheetTitle(props: Readonly<SheetProps>) {
  const { kind, value, update, edit, sheet } = props;
  const level = characterLevel(value.stats);
  const species = value.stats?.species;
  const line = [
    level && t('sheet.level', { level }),
    species && (originsFor(sheet.edition).species.find((s) => s.id === species)?.name ?? species),
    classesText(value.stats) ?? (monsterLine(monsterOf(props)) || value.monster),
    kind === 'actor' && t('sheet.actor'),
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="flex min-w-0 flex-1 flex-col items-start">
      {edit ? (
        <Input
          className="h-9 max-w-md font-display text-2xl text-gold-bright"
          value={value.name}
          aria-label={t('sheet.name')}
          onChange={(e) => update((d) => ({ ...d, name: e.target.value }))}
        />
      ) : (
        <h2 className="m-0 truncate font-display text-[28px] leading-tight text-gold-bright">{value.name}</h2>
      )}
      <span className="text-sm text-muted-foreground capitalize italic">{line}</span>
    </div>
  );
}

/** The character's level in a ring, and the bar of experience to the next one. */
function LevelBadge({ value }: Readonly<SheetProps>) {
  const level = characterLevel(value.stats);
  if (!level) return null;
  const xp = xpProgress(value.stats);
  const text = xp && (xp.next ? t('sheet.xp', { xp: xp.xp, next: xp.next }) : t('sheet.xpMax', { xp: xp.xp }));
  return (
    <div className="flex items-center gap-2.5">
      {xp && (
        <div className="flex w-36 flex-col items-end gap-1">
          <span className="text-xs text-muted-foreground">{text}</span>
          <span
            className="h-1.5 w-full overflow-hidden rounded-full border border-gold-dim/60 bg-black/50"
            role="meter"
            aria-label={text}
            aria-valuenow={xp.percent}
          >
            <span
              className="block h-full bg-gradient-to-r from-gold-dim to-gold-bright"
              style={{ width: `${xp.percent}%` }}
            />
          </span>
        </div>
      )}
      <span
        className="flex size-11 items-center justify-center rounded-full border-2 border-gold bg-black/50 font-display text-xl text-gold-bright shadow-[0_0_10px_rgba(232,211,166,0.25)]"
        title={t('sheet.level', { level })}
      >
        {level}
      </span>
    </div>
  );
}

/** The GM (or a trusted player, on their own creature) rests it, as the party rest buttons do for everyone. */
function RestButtons({ session, value }: Readonly<SheetProps>) {
  return (
    <div className="flex gap-1">
      <Button
        variant="outline"
        size="icon"
        title={t('sheet.shortRest')}
        aria-label={t('sheet.shortRest')}
        onClick={() => session.requests.rest([value.id], 'short')}
      >
        <TentIcon />
      </Button>
      <Button
        variant="outline"
        size="icon"
        title={t('sheet.longRest')}
        aria-label={t('sheet.longRest')}
        onClick={() => session.requests.rest([value.id], 'long')}
      >
        <MoonIcon />
      </Button>
    </div>
  );
}
