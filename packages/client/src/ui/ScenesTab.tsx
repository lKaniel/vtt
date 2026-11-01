import type { Doc, Patch } from '@vtt/core';
import { gridSizePatch, isGm } from '@vtt/shared';
import { useState } from 'react';
import type { Session } from '../session.ts';

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
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New scene name" />
        <button className="btn small" disabled={!name.trim()}>
          Add
        </button>
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
  return (
    <li className={`scene-row${here ? ' here' : ''}`}>
      <div className="scene-head">
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
        <button className="btn small" disabled={here} onClick={() => session.viewScene(id)}>
          View
        </button>
        <button className="btn small" disabled={active} onClick={() => session.activateScene(id)}>
          Play here
        </button>
        <SendPlayer session={session} scene={id} />
        <button className={`btn small${open ? ' active' : ''}`} onClick={onToggle}>
          Settings
        </button>
        <button className="btn small" onClick={() => session.duplicateScene(id)} title="A copy with everything on it">
          Copy
        </button>
        <button
          className="btn small"
          disabled={active}
          title={active ? 'Play another scene first' : 'Delete it and everything on it (Ctrl+Z undoes)'}
          onClick={() => session.deleteScene(id)}
        >
          Delete
        </button>
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
    <select
      value=""
      aria-label="Send a player here"
      onChange={(e) => session.sendPlayer(e.target.value, scene === session.activeScene ? undefined : scene)}
    >
      <option value="">Send…</option>
      {elsewhere.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
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
        <input
          defaultValue={nameOf(doc)}
          onBlur={(e) =>
            e.target.value.trim() && e.target.value !== nameOf(doc) && edit({ name: e.target.value.trim() })
          }
        />
      </label>
      <label>
        <span>Grid</span>
        <select value={str(doc, 'grid', 'none')} onChange={(e) => edit({ grid: e.target.value })}>
          <option value="none">None: walk anywhere, distances in feet</option>
          <option value="square">Squares: walk square to square</option>
        </select>
      </label>
      <label>
        <span>Pixels per 5 ft</span>
        <input
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
        <input
          type="color"
          defaultValue={str(doc, 'gridColor', '#000000')}
          onBlur={(e) => edit({ gridColor: e.target.value })}
        />
      </label>
      <label>
        <span>Grid opacity</span>
        <Slider value={num(doc, 'gridOpacity', 0.16)} onDone={(v) => edit({ gridOpacity: v })} />
      </label>
      <label>
        <span>Darkness</span>
        <Slider value={num(doc, 'darkness', 0)} onDone={(v) => edit({ darkness: v })} />
      </label>
      <label>
        <span>Background</span>
        <input
          type="color"
          defaultValue={str(doc, 'background', '#1b1d22')}
          onBlur={(e) => edit({ background: e.target.value })}
        />
      </label>
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

function Slider({ value, onDone }: Readonly<{ value: number; onDone: (v: number) => void }>) {
  const [v, setV] = useState(value);
  return (
    <input
      type="range"
      min={0}
      max={1}
      step={0.05}
      value={v}
      onChange={(e) => setV(Number(e.target.value))}
      onPointerUp={() => onDone(v)}
      onKeyUp={() => onDone(v)}
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
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
