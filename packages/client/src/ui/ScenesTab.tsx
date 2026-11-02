import type { Doc, Patch } from '@vtt/core';
import { gridSizePatch, isGm, sceneThumb } from '@vtt/shared';
import { assetUrl } from '../assets.ts';
import { useState } from 'react';
import type { Session } from '../session.ts';
import { Button } from './kit/button.tsx';
import { Input } from './kit/input.tsx';
import { Toggle } from './kit/toggle.tsx';
import { SelectField } from './kit/select.tsx';
import { ColorInput } from './kit/color-input.tsx';
import { Slider } from './kit/slider.tsx';
import { Checkbox } from './kit/checkbox.tsx';

/**
 * GM: the game's scenes. View looks at one (to prepare it) without moving
 * anyone; Play here moves the game there with everyone. Each scene can be
 * copied, deleted (Ctrl+Z brings it back) and set up: grid, lighting, fog.
 */
export function ScenesTab({ session }: Readonly<{ session: Session }>) {
  const [name, setName] = useState('');
  const [open, setOpen] = useState<string>();
  const add = (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    session.createScene(name.trim());
    setName('');
  };
  return (
    <div className="scenes-tab">
      <form className="scene-new" onSubmit={add}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New scene name" />
        <Button variant="outline" size="sm" disabled={!name.trim()}>
          Add
        </Button>
      </form>
      <ul className="rows">
        {session.sceneList().map((doc) => (
          <SceneRow
            key={doc.id}
            session={session}
            doc={doc}
            open={open === doc.id}
            onToggle={() => setOpen(open === doc.id ? undefined : doc.id)}
          />
        ))}
      </ul>
      <p className="muted">
        View: look at a scene and edit it; the players stay where they are. Play here: the game and everyone move there.
        Send a player on their own to split the party.
      </p>
    </div>
  );
}

const nameOf = (doc: Doc) => (typeof doc.name === 'string' ? doc.name : doc.id);

function SceneRow({
  session,
  doc,
  open,
  onToggle,
}: Readonly<{ session: Session; doc: Doc; open: boolean; onToggle: () => void }>) {
  const id = doc.id;
  const here = session.scene === id;
  const active = session.activeScene === id;
  const seats = session.seatsOn(id).filter((p) => !isGm(p));
  const thumb = sceneThumb(session.docs, id);
  return (
    <li className={`scene-row${here ? ' here' : ''}`}>
      <div className="scene-head">
        {thumb && <img src={assetUrl(thumb)} alt="" className="h-8 w-12 rounded-sm object-cover" />}
        <span className="row-name">{nameOf(doc)}</span>
        {active && <span className="scene-badge">Game</span>}
        {here && <span className="scene-badge you">You</span>}
      </div>
      {seats.length > 0 && (
        <div className="scene-seats">
          {seats.map((p) => (
            <span key={p.id} className="seat-chip" style={{ borderColor: p.color }}>
              {p.name}
            </span>
          ))}
        </div>
      )}
      <div className="scene-actions">
        <Button variant="outline" size="sm" disabled={here} onClick={() => session.viewScene(id)}>
          View
        </Button>
        <Button variant="outline" size="sm" disabled={active} onClick={() => session.activateScene(id)}>
          Play here
        </Button>
        <SendPlayer session={session} scene={id} />
        <Toggle variant="plate" pressed={open} onPressedChange={onToggle}>
          Settings
        </Toggle>
        <Button
          variant="outline"
          size="sm"
          onClick={() => session.duplicateScene(id)}
          title="A copy with everything on it"
        >
          Copy
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={active}
          title={active ? 'Play another scene first' : 'Delete it and everything on it (Ctrl+Z undoes)'}
          onClick={() => session.deleteScene(id)}
        >
          Delete
        </Button>
      </div>
      {open && <SceneSettings session={session} doc={doc} />}
    </li>
  );
}

/** Sends one player to this scene on their own. */
function SendPlayer({ session, scene }: Readonly<{ session: Session; scene: string }>) {
  const elsewhere = session.players.filter((p) => !isGm(p) && !session.seatsOn(scene).includes(p));
  if (!elsewhere.length) return null;
  return (
    <SelectField
      value=""
      aria-label="Send a player here"
      placeholder="Send…"
      className="h-8 text-xs"
      onValueChange={(id) => session.sendPlayer(id, scene === session.activeScene ? undefined : scene)}
      options={elsewhere.map((p) => ({ value: p.id, label: p.name }))}
    />
  );
}

const num = (doc: Doc, key: string, fallback: number) => (typeof doc[key] === 'number' ? doc[key] : fallback);
const str = (doc: Doc, key: string, fallback: string) => (typeof doc[key] === 'string' ? doc[key] : fallback);
const flag = (doc: Doc, key: string, fallback: boolean) => (typeof doc[key] === 'boolean' ? doc[key] : fallback);

function SceneSettings({ session, doc }: Readonly<{ session: Session; doc: Doc }>) {
  const edit = (patch: Patch) => session.editScene(doc.id, patch);
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
      <label>
        <span>Grid</span>
        <SelectField
          value={str(doc, 'grid', 'none')}
          onValueChange={(grid) => edit({ grid })}
          options={[
            { value: 'none', label: 'None: walk anywhere, distances in feet' },
            { value: 'square', label: 'Squares: walk square to square' },
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
      <NavFields doc={doc} edit={edit} />
      <Check label="Fog of war" value={flag(doc, 'vision', true)} onChange={(v) => edit({ vision: v })} />
      <Check
        label="Remember explored ground"
        value={flag(doc, 'exploration', true)}
        onChange={(v) => edit({ exploration: v })}
      />
      <Check
        label="Darkness follows the clock"
        value={flag(doc, 'darknessFollowsClock', false)}
        onChange={(v) => edit({ darknessFollowsClock: v })}
        title="Saved now; takes effect once the game has world time"
      />
    </div>
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
