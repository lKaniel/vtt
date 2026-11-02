import {
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
import type { Session } from '../session.ts';
import type { SheetTarget } from '../session-sheets.ts';
import { tokenPatch } from '../token-edit.ts';
import { previewSheet, type Draft, type Update } from './sheet-model.ts';
import { Details } from './SheetDetails.tsx';
import { FeaturesPage, SpellsPage } from './SheetPages.tsx';
import { InventoryPage } from './InventoryPage.tsx';
import { EffectsPage } from './EffectsPage.tsx';
import { AnimationsPage } from './AnimationsPage.tsx';
import { useAutoSave } from './useAutoSave.ts';
import { sheetDropTarget } from './sheet-drop.ts';
import { cn } from '@/lib/utils';
import { Button } from './kit/button.tsx';
import { Input } from './kit/input.tsx';
import { Tabs, TabsList, TabsTrigger } from './kit/tabs.tsx';
import { Abilities, Hero } from './SheetHero.tsx';

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
export function CharacterSheet({
  session,
  onPopOut,
}: Readonly<{ session: Session; onPopOut: (target: SheetTarget & { edit: boolean }) => void }>) {
  const target = session.sheets.current;
  const live = target && liveOf(session, target);
  if (!target || !live) return null;
  const controls: SheetControls = {
    setEdit: (edit) => session.sheets.setEdit(edit),
    close: () => session.sheets.open(undefined),
    popOut: () => {
      onPopOut(target);
      session.sheets.open(undefined);
    },
  };
  return (
    <SheetWindow
      key={`${target.kind}:${target.id}`}
      session={session}
      target={target}
      live={live}
      controls={controls}
    />
  );
}

/** What the sheet's header buttons do: the sheet over the map, or one in its own window (no pop-out). */
export interface SheetControls {
  setEdit: (edit: boolean) => void;
  close: () => void;
  popOut?: () => void;
}

const liveOf = (session: Session, t: SheetTarget): Draft | undefined =>
  t.kind === 'token' ? session.tokens.get(t.id) : session.actors.get(t.id);

/** A sheet popped out into its own window (PopOutWindow.tsx), with its own edit mode. */
export function PoppedSheet({
  session,
  target,
  controls,
}: Readonly<{ session: Session; target: SheetTarget & { edit: boolean }; controls: SheetControls }>) {
  const live = liveOf(session, target);
  if (!live) return <p className="muted p-6">{"This sheet isn't on the table any more."}</p>;
  return <SheetWindow session={session} target={target} live={live} controls={controls} />;
}

function SheetWindow({
  session,
  target,
  live,
  controls,
}: Readonly<{ session: Session; target: SheetTarget & { edit: boolean }; live: Draft; controls: SheetControls }>) {
  const liveRef = useRef(live);
  useEffect(() => {
    liveRef.current = live;
  });
  const { value, update } = useAutoSave<Draft>(live, (draft) => {
    if (target.kind === 'token') session.requests.editToken(live.id, tokenPatch(liveRef.current, draft));
    else session.requests.saveActor(draft);
  });
  const rules = editionOf(value, session.world ?? {});
  const sheet = sheetOf(session, target, live, previewSheet(value, rules));
  if (!sheet) return null;
  const props: SheetProps = { session, kind: target.kind, value, update, sheet, edit: target.edit };
  return (
    <section
      className={cn('sheet frame', target.edit && 'editing', !controls.popOut && POPPED)}
      aria-label={`${value.name}'s character sheet`}
      {...sheetDropTarget(session)}
    >
      <SheetHead {...props} controls={controls} />
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

/** A sheet in its own window fills it instead of floating over the map. */
const POPPED = 'static! top-auto! left-auto! min-h-screen w-full! max-h-none! transform-none!';

function SheetHead({
  session,
  kind,
  value,
  update,
  edit,
  controls,
}: Readonly<SheetProps & { controls: SheetControls }>) {
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
          <Button variant="outline" size="sm" onClick={() => controls.setEdit(!edit)} title="Edit mode (E)">
            {edit ? 'Done' : 'Edit'}
          </Button>
        )}
        {controls.popOut && (
          <Button variant="outline" size="sm" onClick={controls.popOut} title="Open in its own window">
            Pop out
          </Button>
        )}
        <Button variant="close" onClick={controls.close} aria-label="Close (C)" title="Close (C)" />
      </div>
    </header>
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
