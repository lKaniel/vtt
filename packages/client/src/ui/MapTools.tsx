import { useState } from 'react';
import { LIGHT_PRESETS, type LightPreset, type MapTool } from '../map-tools.ts';
import type { Session } from '../session.ts';

const TOOLS: { tool: MapTool | undefined; label: string; hint: string }[] = [
  { tool: undefined, label: 'Play', hint: 'Select and move tokens' },
  { tool: 'wall', label: 'Walls', hint: 'Click corner to corner; right click or Esc stops. Shift: no snapping' },
  { tool: 'door', label: 'Doors', hint: 'Click both ends of the doorway' },
  { tool: 'window', label: 'Windows', hint: 'Like walls, but they let sight through' },
  { tool: 'light', label: 'Lights', hint: 'Click to place, drag one to move it' },
  { tool: 'erase', label: 'Erase', hint: 'Click a wall, door, window or light' },
];

/** The GM's map tools down the left side, with the time of day. */
export function MapTools({ session }: Readonly<{ session: Session }>) {
  if (session.you?.role !== 'gm') return null;
  const current = session.mapTool;
  return (
    <div className="map-tools frame">
      <div className="map-tools-row">
        {TOOLS.map(({ tool, label, hint }) => (
          <button
            key={label}
            className={`btn small${current === tool ? ' active' : ''}`}
            title={hint}
            onClick={() => session.setMapTool(tool)}
          >
            {label}
          </button>
        ))}
      </div>
      {current === 'light' && (
        <select
          value={session.lightPreset}
          onChange={(e) => session.setLightPreset(e.target.value as LightPreset)}
          title="The light the next click places"
        >
          {Object.entries(LIGHT_PRESETS).map(([id, l]) => (
            <option key={id} value={id}>
              {l.label} ({l.darkness ? `${l.bright} ft` : `${l.bright}/${l.dim} ft`})
            </option>
          ))}
        </select>
      )}
      <Darkness key={session.world?.darkness ?? 0} session={session} />
    </div>
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
