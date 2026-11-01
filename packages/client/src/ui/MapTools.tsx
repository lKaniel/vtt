import type { EditorMode } from '@vtt/shared';
import { useState } from 'react';
import { LIGHT_PRESETS, type LightPreset } from '../map-tools.ts';
import type { Session } from '../session.ts';
import type { EditorTool } from '../session-editor.ts';

const MODES: { mode: EditorMode; label: string; key: string; hint: string }[] = [
  { mode: 'tokens', label: 'Tokens', key: 'T', hint: 'Select, move and act with creatures' },
  { mode: 'tiles', label: 'Tiles', key: 'Shift+T', hint: 'Select, move and resize tiles' },
  { mode: 'walls', label: 'Walls', key: 'W', hint: 'Select, move and reshape walls, doors and windows' },
  { mode: 'lights', label: 'Lights', key: 'L', hint: 'Select, move and resize lights' },
];

const SELECT = {
  tool: 'select' as const,
  label: 'Select',
  hint: 'Click or drag a box to select; drag to move; drag a handle to reshape',
};

/** The tools of each mode, after Select. */
const TOOLS: Partial<Record<EditorMode, { tool: EditorTool; label: string; hint: string }[]>> = {
  walls: [
    SELECT,
    { tool: 'wall', label: 'Wall', hint: 'Click corner to corner; right click or Esc stops. Shift: no snapping' },
    { tool: 'door', label: 'Door', hint: 'Click both ends of the doorway' },
    { tool: 'window', label: 'Window', hint: 'Like walls, but they let sight through' },
  ],
  lights: [SELECT, { tool: 'place', label: 'Place', hint: 'Click to place the light picked below' }],
};

/** The GM's editor modes down the left side, each mode's tools, and the time of day. */
export function MapTools({ session }: Readonly<{ session: Session }>) {
  if (!session.isGm()) return null;
  const tools = TOOLS[session.mode];
  return (
    <div className="map-tools frame">
      <div className="map-tools-row" role="toolbar" aria-label="Editor mode">
        {MODES.map(({ mode, label, key, hint }) => (
          <button
            key={mode}
            className={`btn small${session.mode === mode ? ' active' : ''}`}
            title={`${hint} (${key})`}
            onClick={() => session.setMode(mode)}
          >
            {label}
          </button>
        ))}
      </div>
      {tools && (
        <div className="map-tools-row" role="toolbar" aria-label="Tool">
          {tools.map(({ tool, label, hint }) => (
            <button
              key={tool}
              className={`btn small${session.tool === tool ? ' active' : ''}`}
              title={hint}
              onClick={() => session.setTool(tool)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {session.mode === 'lights' && <LightPresets session={session} />}
      <Darkness key={session.world?.darkness ?? 0} session={session} />
    </div>
  );
}

function LightPresets({ session }: Readonly<{ session: Session }>) {
  return (
    <select
      value={session.lightPreset}
      onChange={(e) => session.setLightPreset(e.target.value as LightPreset)}
      title="The light the Place tool and the menu put down"
    >
      {Object.entries(LIGHT_PRESETS).map(([id, l]) => (
        <option key={id} value={id}>
          {l.label} ({l.darkness ? `${l.bright} ft` : `${l.bright}/${l.dim} ft`})
        </option>
      ))}
    </select>
  );
}

/** A slider from day to night; the change is sent when you let go. It starts over when the darkness changes. */
function Darkness({ session }: Readonly<{ session: Session }>) {
  const [value, setValue] = useState(session.world?.darkness ?? 0);
  return (
    <label className="map-tools-darkness" title="Time of day: how dark unlit places are">
      <span>Day</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        onPointerUp={() => session.setDarkness(value)}
        onKeyUp={() => session.setDarkness(value)}
      />
      <span>Night</span>
    </label>
  );
}
