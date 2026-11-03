import { actorFromToken } from '@vtt/system-dnd5e';
import { uniqueId } from '@vtt/shared';
import { useState } from 'react';
import { t } from '../../i18n/index.ts';
import type { Session } from '../../session/session.ts';
import { Button } from '../kit/button.tsx';
import type { SheetProps } from './sheet-props.ts';

/** Edit mode: keep, place or delete what's on the sheet. */
export function SheetFoot(props: Readonly<SheetProps>) {
  return (
    <footer className="flex items-center gap-2 border-t border-gold-dim/50 px-5 py-2 text-sm">
      <span className="text-muted-foreground italic">{t('sheet.changesSave')}</span>
      <span className="flex-1" />
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
  const relink = (how: 'link' | 'unlink' | 'save' | 'reset') => session.requests.relinkToken(id, how);
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
    if (kind === 'token') session.requests.deleteToken(value.id);
    else session.requests.deleteActor(value.id);
    session.sheets.open(undefined);
  };
  const saveAsActor = () => {
    const id = uniqueId(value.name, (x) => session.actors.has(x));
    session.requests.saveActor(actorFromToken({ x: 0, y: 0, ...value }, id));
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
          onClick={() => session.drops.spawn({ kind: 'actor', id: value.id }, session.editor.viewCentre())}
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
