import { type Actor, classesText, type TokenView } from '@vtt/system-dnd5e';
import { uniqueId } from '@vtt/shared';
import {
  CopyIcon,
  CrosshairIcon,
  EyeIcon,
  EyeOffIcon,
  MapPinIcon,
  PlusIcon,
  ScrollTextIcon,
  Trash2Icon,
} from 'lucide-react';
import { useState } from 'react';
import { DRAG_TYPE, type DragPayload } from '../play/drops.ts';
import { t } from '../i18n/index.ts';
import { readPref, writePref } from '../prefs.ts';
import type { Session } from '../session/session.ts';
import { Directory, type DirItem, type FilterDef } from './directory/Directory.tsx';
import { Face, HpBar } from './Portrait.tsx';
import { Badge } from './kit/badge.tsx';
import { Button } from './kit/button.tsx';
import { Checkbox } from './kit/checkbox.tsx';
import { ToggleGroup, ToggleGroupItem } from './kit/toggle-group.tsx';

// The GM's Actors tab: the Actors list of creatures ready to be placed, in
// folders (drag one onto the map to place a copy), and every creature on
// the map. Right-click one for what it can do.

export function startDrag(e: React.DragEvent, payload: DragPayload): void {
  e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = 'copy';
}

function subtitle(t: Pick<TokenView, 'monster' | 'stats'>): string {
  const level = t.stats?.classes ? undefined : t.stats?.level;
  const cls = t.stats?.class || t.stats?.classes ? [classesText(t.stats), level].filter(Boolean).join(' ') : t.monster;
  return [cls, t.stats?.rules && `${t.stats.rules} rules`].filter(Boolean).join(' · ');
}

/** What a creature is, for the type filter. */
function typeOf(c: Pick<Actor, 'monster' | 'stats'>): string {
  if (c.monster) return 'monster';
  return c.stats ? 'character' : 'other';
}

const TYPE_FILTER = (): FilterDef => ({
  key: 'type',
  label: t('actors.type'),
  options: [
    { value: 'character', label: t('actors.type.character') },
    { value: 'monster', label: t('actors.type.monster') },
    { value: 'other', label: t('actors.type.other') },
  ],
});

type Show = 'actors' | 'map';
const SHOWS: readonly Show[] = ['actors', 'map'];

export function ActorsTab({ session }: Readonly<{ session: Session }>) {
  const [show, setShow] = useState<Show>(() => readPref('actors-show', SHOWS, 'actors'));
  const pick = (v: string) => {
    if (!v) return;
    setShow(v as Show);
    writePref('actors-show', v);
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <ToggleGroup type="single" value={show} onValueChange={pick}>
        <ToggleGroupItem value="actors">{t('actors.list')}</ToggleGroupItem>
        <ToggleGroupItem value="map">{t('actors.onMap')}</ToggleGroupItem>
      </ToggleGroup>
      {show === 'actors' ? <ActorList session={session} /> : <TokenList session={session} />}
    </div>
  );
}

function newActor(session: Session): void {
  const id = uniqueId('New actor', (x) => session.actors.has(x));
  session.requests.saveActor({
    id,
    name: 'New actor',
    size: 1,
    color: '#8a6a4a',
    speed: 30,
    darkvision: 0,
    hidden: false,
  });
  session.sheets.open({ kind: 'actor', id }, true);
}

function duplicate(session: Session, actor: Actor): void {
  const name = t('actors.copyName', { name: actor.name });
  session.requests.saveActor({ ...actor, id: uniqueId(name, (x) => session.actors.has(x)), name });
}

function actorItem(session: Session, actor: Actor): DirItem {
  const edit = () => session.sheets.open({ kind: 'actor', id: actor.id }, true);
  const sub = subtitle(actor);
  return {
    key: actor.id,
    ref: { coll: 'actors', id: actor.id },
    name: actor.name,
    folder: actor.folder,
    tags: { type: typeOf(actor) },
    search: sub,
    look: {
      picture: <Face token={{ ...actor, x: 0, y: 0 }} className="rounded-none border-0" />,
      sub: sub || t('actors.actor'),
    },
    open: edit,
    drag: (e) => startDrag(e, { kind: 'actor', id: actor.id }),
    title: t('actors.dragHint'),
    menu: [
      { label: t('actors.openSheet'), icon: ScrollTextIcon, run: edit },
      {
        label: t('actors.placeCentre'),
        icon: MapPinIcon,
        run: () => session.drops.spawn({ kind: 'actor', id: actor.id }, session.editor.viewCentre()),
      },
      { label: t('list.duplicate'), icon: CopyIcon, run: () => duplicate(session, actor) },
      'separator',
      { label: t('list.delete'), icon: Trash2Icon, danger: true, run: () => session.requests.deleteActor(actor.id) },
    ],
  };
}

function ActorList({ session }: Readonly<{ session: Session }>) {
  const items = [...session.actors.values()].map((a) => actorItem(session, a));
  return (
    <Directory
      session={session}
      id="actors"
      items={items}
      folders={{ kind: 'actors', editable: session.isGm() }}
      what={t('actors.what')}
      filters={[TYPE_FILTER()]}
      actions={
        <Button variant="outline" size="sm" onClick={() => newActor(session)} title={t('actors.new')}>
          <PlusIcon />
          {t('actors.newShort')}
        </Button>
      }
      options={
        <label className="ed-check lib-hidden">
          <Checkbox checked={session.drops.hidden} onCheckedChange={(on) => session.drops.setHidden(on === true)} />
          <span>{t('actors.placeHidden')}</span>
        </label>
      }
      empty={t('actors.none')}
      hint={t('actors.hint')}
    />
  );
}

function tokenItem(session: Session, token: TokenView): DirItem {
  const sheet = () => session.sheets.open({ kind: 'token', id: token.id }, true);
  const show = () => {
    session.select(token.id);
    session.focus([token.x, token.y]);
  };
  const sub = subtitle(token);
  return {
    key: token.id,
    name: token.name,
    tags: { type: typeOf(token), seen: token.hidden ? 'hidden' : 'shown' },
    search: sub,
    look: {
      picture: <Face token={token} className="rounded-none border-0" />,
      sub: sub || t('actors.token'),
      on: token.id === session.selected,
      badge: token.hidden && <Badge variant="muted">{t('actors.hidden')}</Badge>,
      meter: <HpBar token={token} showLabel={false} />,
    },
    open: show,
    openTwice: sheet,
    menu: [
      { label: t('actors.showOnMap'), icon: CrosshairIcon, run: show },
      { label: t('actors.openSheet'), icon: ScrollTextIcon, run: sheet },
      {
        label: t(token.hidden ? 'actors.reveal' : 'actors.hide'),
        icon: token.hidden ? EyeIcon : EyeOffIcon,
        run: () => session.requests.editToken(token.id, { hidden: !token.hidden }),
      },
      'separator',
      {
        label: t('actors.removeToken'),
        icon: Trash2Icon,
        danger: true,
        run: () => session.requests.deleteToken(token.id),
      },
    ],
  };
}

function TokenList({ session }: Readonly<{ session: Session }>) {
  const items = [...session.tokens.values()].map((tok) => tokenItem(session, tok));
  return (
    <Directory
      session={session}
      id="tokens"
      items={items}
      what={t('actors.whatTokens')}
      filters={[
        TYPE_FILTER(),
        {
          key: 'seen',
          label: t('actors.seen'),
          options: [
            { value: 'shown', label: t('actors.seen.shown') },
            { value: 'hidden', label: t('actors.hidden') },
          ],
        },
      ]}
      empty={t('actors.noTokens')}
      hint={t('actors.tokenHint')}
    />
  );
}
