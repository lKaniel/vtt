import { characterLevel, classesText } from '@vtt/system-dnd5e';
import { ExternalLinkIcon, MoonIcon, TentIcon } from 'lucide-react';
import { t } from '../../i18n/index.ts';
import { xpProgress } from '../../text/sheet-text.ts';
import { Button } from '../kit/button.tsx';
import { Input } from '../kit/input.tsx';
import { Switch } from '../kit/switch.tsx';
import type { SheetProps } from './sheet-props.ts';
import { LevelUpButton } from './LevelUpButton.tsx';

/** What the sheet's header buttons do: the sheet over the map, or one in its own window (no pop-out). */
export interface SheetControls {
  setEdit: (edit: boolean) => void;
  close: () => void;
  popOut?: () => void;
}

/** Name and classes on the left; level, experience and rests on the right, and (in its own browser window) edit mode and close. */
export function SheetHeader(props: Readonly<SheetProps & { controls: SheetControls }>) {
  const { session, kind, edit, controls } = props;
  return (
    <header className="flex items-center gap-4 border-b border-gold-dim/50 px-5 pt-3 pb-2">
      <SheetTitle {...props} />
      <LevelUpButton {...props} />
      <LevelBadge {...props} />
      {kind === 'token' && session.isGm() && !edit && <RestButtons {...props} />}
      {!controls.popOut && <SheetButtons {...props} />}
    </header>
  );
}

/** Edit mode (for those who may edit it), pop out, and close when the sheet has no window round it to close it. */
export function SheetButtons(props: Readonly<SheetProps & { controls: SheetControls }>) {
  const { session, kind, value, edit, controls } = props;
  const editable = kind === 'actor' ? session.isGm() : session.canEdit(value.id);
  return (
    <div className="flex items-center gap-2">
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

function SheetTitle({ kind, value, update, edit }: Readonly<SheetProps>) {
  const level = characterLevel(value.stats);
  const line = [
    level && t('sheet.level', { level }),
    classesText(value.stats) ?? value.monster,
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

/** The GM rests this creature, as the party rest buttons do for everyone. */
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
