import type { Doc, Patch } from '@vtt/core';
import { gridSizePatch, isGm, sceneThumb } from '@vtt/shared';
import { CopyIcon, EyeIcon, MapIcon, PlayIcon, SendIcon, SettingsIcon, Trash2Icon, PlusIcon } from 'lucide-react';
import { assetUrl } from '../assets.ts';
import { useState } from 'react';
import { t } from '../i18n/index.ts';
import type { Session } from '../session/session.ts';
import { Directory, type DirItem } from './directory/Directory.tsx';
import type { MenuEntry } from './directory/menu.tsx';
import { Badge } from './kit/badge.tsx';
import { Button } from './kit/button.tsx';
import { Dialog, DialogContent, DialogTitle } from './kit/dialog.tsx';
import { Input } from './kit/input.tsx';
import { SelectField } from './kit/select.tsx';
import { ColorInput } from './kit/color-input.tsx';
import { Slider } from './kit/slider.tsx';
import { Checkbox } from './kit/checkbox.tsx';
import { WeatherFields } from './WeatherFields.tsx';

/**
 * GM: the game's scenes, in folders. A click views one (to prepare it)
 * without moving anyone; the right-click menu plays the game there with
 * everyone, sends one player there, opens its settings (grid, lighting,
 * fog, weather), copies it or deletes it (Ctrl+Z brings it back).
 */
export function ScenesTab({ session }: Readonly<{ session: Session }>) {
  const [settings, setSettings] = useState<string>();
  const items = session.scenes.list().map((doc) => sceneItem(session, doc, setSettings));
  const open = settings ? session.docs.get('scenes', settings) : undefined;
  return (
    <>
      <Directory
        session={session}
        id="scenes"
        items={items}
        folders={{ kind: 'scenes', editable: true }}
        what={t('scenes.what')}
        filters={[
          {
            key: 'nav',
            label: t('scenes.nav'),
            options: [
              { value: 'yes', label: t('scenes.nav.yes') },
              { value: 'no', label: t('scenes.nav.no') },
            ],
          },
        ]}
        actions={
          <Button variant="outline" size="sm" onClick={() => setSettings(session.scenes.create(t('scenes.newName')))}>
            <PlusIcon />
            {t('scenes.new')}
          </Button>
        }
        empty={t('scenes.none')}
        hint={t('scenes.hint')}
      />
      <Dialog open={!!open} onOpenChange={(on) => !on && setSettings(undefined)}>
        {open && (
          <DialogContent>
            <DialogTitle>{nameOf(open)}</DialogTitle>
            <SceneSettings session={session} doc={open} />
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

const nameOf = (doc: Doc) => (typeof doc.name === 'string' ? doc.name : doc.id);

/** Who may be sent here on their own: the players on other scenes. */
function sendMenu(session: Session, scene: string): MenuEntry {
  const elsewhere = session.players.filter((p) => !isGm(p) && !session.scenes.seatsOn(scene).includes(p));
  return {
    label: t('scenes.send'),
    icon: SendIcon,
    disabled: !elsewhere.length,
    items: elsewhere.map((p) => ({
      label: p.name,
      swatch: p.color,
      run: () => session.scenes.sendPlayer(p.id, scene === session.scenes.active ? undefined : scene),
    })),
  };
}

function sceneBadges(here: boolean, active: boolean) {
  if (!here && !active) return undefined;
  return (
    <span className="flex gap-1">
      {active && <Badge>{t('scenes.game')}</Badge>}
      {here && <Badge variant="muted">{t('scenes.you')}</Badge>}
    </span>
  );
}

function sceneItem(session: Session, doc: Doc, settings: (id: string) => void): DirItem {
  const id = doc.id;
  const here = session.scene === id;
  const active = session.scenes.active === id;
  const seats = session.scenes.seatsOn(id).filter((p) => !isGm(p));
  const thumb = sceneThumb(session.docs, id);
  return {
    key: id,
    ref: { coll: 'scenes', id },
    name: nameOf(doc),
    folder: typeof doc.folder === 'string' ? doc.folder : undefined,
    tags: { nav: doc.navigation === true ? 'yes' : 'no' },
    look: {
      picture: thumb ? (
        <img src={assetUrl(thumb)} alt="" className="object-cover" draggable={false} />
      ) : (
        <span className="flex items-center justify-center text-gold">
          <MapIcon className="size-4" />
        </span>
      ),
      sub: seats.map((p) => p.name).join(', '),
      on: here,
      badge: sceneBadges(here, active),
    },
    open: () => !here && session.scenes.view(id),
    openTwice: () => settings(id),
    title: t('scenes.clickHint'),
    menu: [
      { label: t('scenes.view'), icon: EyeIcon, disabled: here, run: () => session.scenes.view(id) },
      { label: t('scenes.play'), icon: PlayIcon, disabled: active, run: () => session.scenes.activate(id) },
      sendMenu(session, id),
      { label: t('scenes.settings'), icon: SettingsIcon, run: () => settings(id) },
      { label: t('scenes.copy'), icon: CopyIcon, title: t('scenes.copyHint'), run: () => session.scenes.duplicate(id) },
      'separator',
      {
        label: t('list.delete'),
        icon: Trash2Icon,
        danger: true,
        disabled: active,
        title: t(active ? 'scenes.deleteActive' : 'scenes.deleteHint'),
        run: () => session.scenes.delete(id),
      },
    ],
  };
}

const num = (doc: Doc, key: string, fallback: number) => (typeof doc[key] === 'number' ? doc[key] : fallback);
const str = (doc: Doc, key: string, fallback: string) => (typeof doc[key] === 'string' ? doc[key] : fallback);
const flag = (doc: Doc, key: string, fallback: boolean) => (typeof doc[key] === 'boolean' ? doc[key] : fallback);

function SceneSettings({ session, doc }: Readonly<{ session: Session; doc: Doc }>) {
  const edit = (patch: Patch) => session.scenes.edit(doc.id, patch);
  return (
    <div className="scene-settings">
      <label>
        <span>Name</span>
        <Input
          defaultValue={nameOf(doc)}
          onBlur={(e) =>
            e.target.value.trim() && e.target.value !== nameOf(doc) && edit({ name: e.target.value.trim() })
          }
        />
      </label>
      <KindField doc={doc} edit={edit} />
      <label>
        <span>Grid</span>
        <SelectField
          value={str(doc, 'grid', 'none')}
          onValueChange={(grid) => edit({ grid })}
          options={[
            { value: 'none', label: 'None: walk anywhere, distances in feet' },
            { value: 'square', label: 'Squares: walk square to square' },
            { value: 'hex-rows', label: 'Hexes in rows (pointy top)' },
            { value: 'hex-cols', label: 'Hexes in columns (flat top)' },
          ]}
        />
      </label>
      <label>
        <span>Pixels per 5 ft</span>
        <Input
          type="number"
          min={10}
          defaultValue={num(doc, 'gridSize', 100)}
          onBlur={(e) =>
            Number(e.target.value) !== num(doc, 'gridSize', 100) && edit(gridSizePatch(Number(e.target.value)))
          }
        />
      </label>
      <label>
        <span>Grid colour</span>
        <ColorInput
          defaultValue={str(doc, 'gridColor', '#000000')}
          onBlur={(e) => edit({ gridColor: e.target.value })}
        />
      </label>
      <label>
        <span>Grid opacity</span>
        <Amount value={num(doc, 'gridOpacity', 0.16)} onDone={(v) => edit({ gridOpacity: v })} />
      </label>
      <label>
        <span>Darkness</span>
        <Amount value={num(doc, 'darkness', 0)} onDone={(v) => edit({ darkness: v })} />
      </label>
      <label>
        <span>Background</span>
        <ColorInput
          defaultValue={str(doc, 'background', '#1b1d22')}
          onBlur={(e) => edit({ background: e.target.value })}
        />
      </label>
      <WeatherFields value={doc.weather} cycle={doc.weatherCycle} edit={edit} />
      <NavFields doc={doc} edit={edit} />
      <SightFields doc={doc} edit={edit} />
      <Check
        label="Darkness follows the clock"
        value={flag(doc, 'darknessFollowsClock', false)}
        onChange={(v) => edit({ darknessFollowsClock: v })}
        title="The darkness is the time of day on the game clock"
      />
    </div>
  );
}

/** Fog of war, remembered ground, and whether walls are drawn. */
function SightFields({ doc, edit }: Readonly<{ doc: Doc; edit: (patch: Patch) => void }>) {
  return (
    <>
      <Check label="Fog of war" value={flag(doc, 'vision', true)} onChange={(v) => edit({ vision: v })} />
      <Check
        label="Draw walls"
        value={flag(doc, 'wallArt', false)}
        onChange={(v) => edit({ wallArt: v })}
        title="Walls as stone and doors that swing, for a map made of plain tiles; off, walls only block"
      />
      <Check
        label="Remember explored ground"
        value={flag(doc, 'exploration', true)}
        onChange={(v) => edit({ exploration: v })}
      />
    </>
  );
}

/** A flat map or a 3D scene, which everyone sees in 3D. */
function KindField({ doc, edit }: Readonly<{ doc: Doc; edit: (patch: Patch) => void }>) {
  return (
    <label>
      <span>{t('scene.kind')}</span>
      <SelectField
        value={str(doc, 'view', '2d')}
        onValueChange={(view) => edit({ view: view === '3d' ? '3d' : null })}
        options={[
          { value: '2d', label: t('scene.kind.2d') },
          { value: '3d', label: t('scene.kind.3d') },
        ]}
      />
    </label>
  );
}

/** The navigation bar: whether the scene is in it, its name there, and its picture. */
function NavFields({ doc, edit }: Readonly<{ doc: Doc; edit: (patch: Patch) => void }>) {
  const text = (key: string) => (e: React.FocusEvent<HTMLInputElement>) => {
    const v = e.target.value.trim();
    if (v !== str(doc, key, '')) edit({ [key]: v || null });
  };
  return (
    <>
      <Check
        label="In the navigation bar"
        value={flag(doc, 'navigation', false)}
        onChange={(v) => edit({ navigation: v || null })}
      />
      <label>
        <span>Name in the bar</span>
        <Input defaultValue={str(doc, 'navName', '')} placeholder={nameOf(doc)} onBlur={text('navName')} />
      </label>
      <label>
        <span>Thumbnail</span>
        <Input defaultValue={str(doc, 'thumb', '')} placeholder="The background's picture" onBlur={text('thumb')} />
      </label>
    </>
  );
}

/** 0 to 1, saved when let go. */
function Amount({ value, onDone }: Readonly<{ value: number; onDone: (v: number) => void }>) {
  const [v, setV] = useState(value);
  return (
    <Slider
      className="w-32"
      min={0}
      max={1}
      step={0.05}
      value={[v]}
      onValueChange={([n]) => setV(n!)}
      onValueCommit={([n]) => onDone(n!)}
    />
  );
}

function Check({
  label,
  value,
  onChange,
  title,
}: Readonly<{ label: string; value: boolean; onChange: (v: boolean) => void; title?: string }>) {
  return (
    <label className="scene-check" title={title}>
      <Checkbox checked={value} onCheckedChange={(v) => onChange(v === true)} />
      <span>{label}</span>
    </label>
  );
}
