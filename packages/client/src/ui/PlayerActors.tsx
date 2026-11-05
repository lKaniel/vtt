import type { Actor, TokenView } from '@vtt/system-dnd5e';
import { canControl } from '@vtt/shared';
import { CrosshairIcon, MapPinIcon, PencilIcon, PlusIcon, ScrollTextIcon } from 'lucide-react';
import { t } from '../i18n/index.ts';
import type { Session } from '../session/session.ts';
import { Directory, type DirItem } from './directory/Directory.tsx';
import { Face } from './Portrait.tsx';
import { Badge } from './kit/badge.tsx';
import { Button } from './kit/button.tsx';
import { Card } from './kit/card.tsx';
import { useBuiltCharacters } from './creator/BuilderWindow.tsx';
import { startDrag } from '../play/drops.ts';

// A player's Actors tab, as in Foundry: the creatures they own or observe.
// Drag one they own onto the map to place it (the server checks: shown, a
// linked one once per scene), double-click to read its sheet.

/** Selects a token and looks at it. */
function showToken(session: Session, token: TokenView | undefined): void {
  if (!token) return;
  session.select(token.id);
  session.focus([token.x, token.y]);
}

/** The token standing for `actor` on this scene, if one is linked to it. */
function onScene(session: Session, actor: Actor) {
  return [...session.tokens.values()].find((tok) => tok.actor === actor.id && tok.linked);
}

function playerItem(session: Session, actor: Actor, built: boolean): DirItem {
  const you = session.you;
  const mine = !!you && canControl(actor, you);
  const placed = onScene(session, actor);
  const sheet = () =>
    placed
      ? session.sheets.open({ kind: 'token', id: placed.id })
      : session.sheets.open({ kind: 'actor', id: actor.id });
  const show = () => showToken(session, placed);
  const place = () => session.drops.spawn({ kind: 'actor', id: actor.id }, session.editor.viewCentre());
  return {
    key: actor.id,
    ref: { coll: 'actors', id: actor.id },
    name: actor.name,
    folder: actor.folder,
    look: {
      picture: <Face token={{ ...actor, x: 0, y: 0 }} className="rounded-none border-0" />,
      sub: mine ? t('actors.yours') : t('actors.observed'),
      on: !!placed && placed.id === session.selected,
      badge: placed && <Badge variant="muted">{t('actors.onMapBadge')}</Badge>,
    },
    open: placed ? show : sheet,
    openTwice: sheet,
    ...(mine && !placed && { drag: (e: React.DragEvent) => startDrag(e, { kind: 'actor', id: actor.id }) }),
    title: mine ? t('actors.playerDragHint') : undefined,
    menu: playerMenu(session, actor, { mine, placed, built, sheet, show, place }),
  };
}

interface MenuFacts {
  mine: boolean;
  placed?: TokenView;
  built: boolean;
  sheet: () => void;
  show: () => void;
  place: () => void;
}

function playerMenu(session: Session, actor: Actor, f: MenuFacts): DirItem['menu'] {
  const edit = () => session.builder.open({ mode: 'edit', id: actor.id });
  return [
    { label: t('actors.openSheet'), icon: ScrollTextIcon, run: f.sheet },
    ...(f.placed ? [{ label: t('actors.showOnMap'), icon: CrosshairIcon, run: f.show }] : []),
    ...(f.mine && !f.placed ? [{ label: t('actors.placeCentre'), icon: MapPinIcon, run: f.place }] : []),
    ...(f.built ? [{ label: t('builder.edit'), icon: PencilIcon, run: edit }] : []),
  ];
}

/** Your character at the top of the tab: find it on the map, or place it when it isn't there. */
function YourCharacter({ session, actor }: Readonly<{ session: Session; actor: Actor }>) {
  const placed = onScene(session, actor);
  const place = () => session.drops.spawn({ kind: 'actor', id: actor.id }, session.editor.viewCentre());
  const show = () => showToken(session, placed);
  return (
    <Card className="flex items-center gap-2 p-1.5" data-slot="your-character">
      <Face token={placed ?? { ...actor, x: 0, y: 0 }} className="size-10 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="muted text-xs">{t('actors.yourCharacter')}</span>
        <strong className="truncate">{actor.name}</strong>
      </div>
      {placed ? (
        <Button variant="outline" size="sm" onClick={show}>
          <CrosshairIcon />
          {t('actors.find')}
        </Button>
      ) : (
        <Button size="sm" onClick={place}>
          <MapPinIcon />
          {t('actors.placeYours')}
        </Button>
      )}
    </Card>
  );
}

/** The Actors tab for a player: their character first, then all their creatures, ready to place. */
export function PlayerActors({ session }: Readonly<{ session: Session }>) {
  const built = useBuiltCharacters(session).list ?? [];
  const items = session.character.actors().map((a) =>
    playerItem(
      session,
      a,
      built.some((c) => c.id === a.id),
    ),
  );
  const yours = session.character.actor();
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      {yours && <YourCharacter session={session} actor={yours} />}
      <PlayerList session={session} items={items} />
    </div>
  );
}

function PlayerList({ session, items }: Readonly<{ session: Session; items: DirItem[] }>) {
  return (
    <Directory
      session={session}
      id="player-actors"
      items={items}
      folders={{ kind: 'actors', editable: false }}
      what={t('actors.what')}
      actions={
        session.gameId && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => session.builder.open({ mode: 'create' })}
            title={t('builder.createHint')}
          >
            <PlusIcon />
            {t('builder.create')}
          </Button>
        )
      }
      empty={t('actors.playerNone')}
      hint={t('actors.playerHint')}
    />
  );
}
