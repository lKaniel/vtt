import type { EditorMode, ItemMode, TileTexture } from '@vtt/shared';
import { ITEM_TOOLS, type ItemTool } from '../editor/shape-tools.ts';
import { useState } from 'react';
import { LIGHT_PRESETS, TILE_PRESETS, type LightPreset } from '../map-tools.ts';
import type { Session } from '../session.ts';
import type { EditorTool } from '../session-editor.ts';
import { LayersPanel } from './LayersPanel.tsx';
import { Button } from './kit/button.tsx';
import { Toggle } from './kit/toggle.tsx';
import { SelectField } from './kit/select.tsx';
import { Slider } from './kit/slider.tsx';
import { ColorInput } from './kit/color-input.tsx';
import { Checkbox } from './kit/checkbox.tsx';

const MODES: { mode: EditorMode; label: string; key: string; hint: string }[] = [
  { mode: 'tokens', label: 'Tokens', key: 'T', hint: 'Select, move and act with creatures' },
  { mode: 'tiles', label: 'Tiles', key: 'Shift+T', hint: 'Draw, select, move, resize and group tiles' },
  { mode: 'walls', label: 'Walls', key: 'W', hint: 'Select, move and reshape walls, doors and windows' },
  { mode: 'lights', label: 'Lights', key: 'L', hint: 'Select, move and resize lights' },
  { mode: 'drawings', label: 'Draw', key: 'D', hint: 'Shapes, lines, freehand and text on the map' },
  { mode: 'notes', label: 'Notes', key: 'N', hint: 'Pins that open journal entries' },
  { mode: 'templates', label: 'Measure', key: 'M', hint: 'Spell areas: circles, cones, lines and squares' },
  { mode: 'regions', label: 'Regions', key: '', hint: 'Areas that do something when a token walks in' },
  { mode: 'sounds', label: 'Sounds', key: '', hint: 'Ambient sound, louder the nearer you are' },
];

const ITEM_TOOL_INFO: Record<ItemTool, { label: string; hint: string }> = {
  rect: { label: 'Box', hint: 'Drag a box. Shift: no snapping' },
  ellipse: { label: 'Ellipse', hint: 'Drag the box it fills. Shift: no snapping' },
  polygon: { label: 'Polygon', hint: 'Click corner to corner; click the first corner or right click to close' },
  line: { label: 'Line', hint: 'Click point to point; right click ends it' },
  freehand: { label: 'Freehand', hint: 'Drag to draw' },
  text: { label: 'Text', hint: 'Drag the box the text goes in; change the words in the inspector' },
  note: { label: 'Pin', hint: 'Click to put a note down; pick its journal entry in the inspector' },
  sound: { label: 'Place', hint: 'Click to place a sound; pick its file in the inspector' },
  circle: { label: 'Circle', hint: 'Drag out from the centre, in 5 ft steps' },
  cone: { label: 'Cone', hint: 'Drag out from the tip' },
  ray: { label: 'Line', hint: 'Drag out from the start' },
  square: { label: 'Square', hint: 'Drag out from the centre' },
  region: { label: 'Region', hint: 'Click corner to corner; click the first corner or right click to close' },
};

const itemTools = (mode: ItemMode) => [SELECT, ...ITEM_TOOLS[mode].map((tool) => ({ tool, ...ITEM_TOOL_INFO[tool] }))];

const SELECT = {
  tool: 'select' as const,
  label: 'Select',
  hint: 'Click or drag a box to select; drag to move; drag a handle to reshape',
};

/** The tools of each mode, after Select. */
const TOOLS: Partial<Record<EditorMode, { tool: EditorTool; label: string; hint: string }[]>> = {
  tiles: [
    SELECT,
    {
      tool: 'tile',
      label: 'Draw',
      hint: 'Drag a box to draw the tile picked below; on another tile it goes inside it. Shift: no snapping',
    },
  ],
  walls: [
    SELECT,
    { tool: 'wall', label: 'Wall', hint: 'Click corner to corner; right click or Esc stops. Shift: no snapping' },
    { tool: 'door', label: 'Door', hint: 'Click both ends of the doorway' },
    { tool: 'window', label: 'Window', hint: 'Like walls, but they let sight through' },
  ],
  lights: [SELECT, { tool: 'place', label: 'Place', hint: 'Click to place the light picked below' }],
  drawings: itemTools('drawings'),
  notes: itemTools('notes'),
  templates: itemTools('templates'),
  regions: itemTools('regions'),
  sounds: itemTools('sounds'),
};

/** The editor modes down the left side (players: tokens, drawings and templates), each mode's tools, and the GM's map settings. */
export function MapTools({ session }: Readonly<{ session: Session }>) {
  const gm = session.isGm();
  const tools = TOOLS[session.mode];
  const modes = MODES.filter((m) => session.canUseMode(m.mode));
  return (
    <div className="map-tools frame">
      <div className="map-tools-row" role="toolbar" aria-label="Editor mode">
        {modes.map(({ mode, label, key, hint }) => (
          <Toggle
            key={mode}
            pressed={session.mode === mode}
            title={key ? `${hint} (${key})` : hint}
            onPressedChange={() => session.setMode(mode)}
          >
            {label}
          </Toggle>
        ))}
      </div>
      {tools && (
        <div className="map-tools-row" role="toolbar" aria-label="Tool">
          {tools.map(({ tool, label, hint }) => (
            <Toggle
              key={tool}
              pressed={session.tool === tool}
              title={hint}
              onPressedChange={() => session.setTool(tool)}
            >
              {label}
            </Toggle>
          ))}
        </div>
      )}
      {session.mode === 'lights' && <LightPresets session={session} />}
      {session.mode === 'tiles' && <TilePresets session={session} />}
      {session.mode === 'tiles' && <LayersPanel session={session} />}
      {session.mode === 'drawings' && <DrawStyle session={session} />}
      {gm && <SceneTools session={session} />}
    </div>
  );
}

const BRUSHES = [
  { brush: 'reveal' as const, label: 'Reveal', hint: 'Drag to show the players ground they have not explored' },
  { brush: 'hide' as const, label: 'Hide', hint: 'Drag to hide explored ground from the players again' },
];

/**
 * The fog of war on this scene: brushes that paint explored ground in or
 * out (each stroke one undo), whose fog they paint, and a reset. While a
 * brush is on, the map shows what the players picked have explored.
 */
function FogTools({ session }: Readonly<{ session: Session }>) {
  const seats = session.players.filter((p) => p.role !== 'gm');
  const picked = session.fogPlayers?.[0] ?? '';
  return (
    <div className="map-tools-row fog-tools" role="toolbar" aria-label="Fog of war">
      <span className="fog-label">Fog</span>
      {BRUSHES.map(({ brush, label, hint }) => (
        <Toggle
          key={brush}
          pressed={session.fogBrush === brush}
          title={hint}
          onPressedChange={(on) => session.setFogBrush(on ? brush : undefined)}
        >
          {label}
        </Toggle>
      ))}
      <Slider
        className="w-20"
        min={1}
        max={10}
        value={[session.fogBrushSize]}
        title={`Brush: ${session.fogBrushSize} squares across each way`}
        aria-label="Brush size"
        onValueChange={([n]) => session.setFogBrushSize(n!)}
      />
      <SelectField
        value={picked}
        aria-label="Whose fog"
        title="Whose fog the brushes and reset change, and the map shows"
        onValueChange={(id) => session.setFogPlayers(id ? [id] : undefined)}
        options={[{ value: '', label: 'All players' }, ...seats.map((p) => ({ value: p.id, label: p.name }))]}
      />
      <Button
        variant="outline"
        size="sm"
        title="Forget what they explored here (Ctrl+Z undoes)"
        onClick={() => session.resetFog()}
      >
        Reset
      </Button>
    </div>
  );
}

function LightPresets({ session }: Readonly<{ session: Session }>) {
  return (
    <SelectField
      value={session.lightPreset}
      onValueChange={(id) => session.setLightPreset(id as LightPreset)}
      title="The light the Place tool and the menu put down"
      options={Object.entries(LIGHT_PRESETS).map(([id, l]) => ({
        value: id,
        label: `${l.label} (${l.darkness ? l.bright : [l.bright, l.dim].join('/')} ft)`,
      }))}
    />
  );
}

/** A slider from day to night; the change is sent when you let go. It starts over when the darkness changes. */
function Darkness({ session }: Readonly<{ session: Session }>) {
  const [value, setValue] = useState(session.world?.darkness ?? 0);
  const clock = session.docs.get('scenes', session.scene)?.darknessFollowsClock === true;
  if (clock) return <span className="muted map-tools-darkness">Darkness follows the clock</span>;
  return (
    <label className="map-tools-darkness" title="Time of day: how dark unlit places are">
      <span>Day</span>
      <Slider
        className="w-32"
        aria-label="Darkness"
        min={0}
        max={1}
        step={0.05}
        value={[value]}
        onValueChange={([n]) => setValue(n!)}
        onValueCommit={([n]) => session.setDarkness(n!)}
      />
      <span>Night</span>
    </label>
  );
}

function TilePresets({ session }: Readonly<{ session: Session }>) {
  return (
    <SelectField
      value={session.tilePreset}
      onValueChange={(id) => session.setTilePreset(id as TileTexture)}
      title="What the Draw tool paints: ground stays under everything and never holds tiles"
      options={Object.entries(TILE_PRESETS).map(([id, t]) => ({
        value: id,
        label: `${t.label}${t.background ? ' (ground)' : ''}`,
      }))}
    />
  );
}

/** GM: the floor shown, fog of war and the time of day. */
function SceneTools({ session }: Readonly<{ session: Session }>) {
  return (
    <>
      <LevelPicker session={session} />
      {session.world?.vision !== false && <FogTools session={session} />}
      <Darkness key={session.world?.darkness ?? 0} session={session} />
    </>
  );
}

const WIDTHS = [2, 4, 8, 16];

/** How new drawings look: line colour and width, and a fill. */
function DrawStyle({ session }: Readonly<{ session: Session }>) {
  const style = session.itemStyle;
  return (
    <div className="map-tools-row" role="toolbar" aria-label="Drawing style">
      <ColorInput
        value={style.stroke}
        title="Line colour"
        aria-label="Line colour"
        onChange={(e) => session.setItemStyle({ stroke: e.target.value })}
      />
      <SelectField
        value={String(style.strokeWidth)}
        title="Line width"
        aria-label="Line width"
        onValueChange={(w) => session.setItemStyle({ strokeWidth: Number(w) })}
        options={WIDTHS.map((w) => ({ value: String(w), label: `${w} px` }))}
      />
      <label className="map-tools-check" title="Fill boxes, ellipses and polygons">
        <Checkbox
          checked={!!style.fill}
          onCheckedChange={(on) =>
            session.setItemStyle({ fill: on === true ? style.stroke : undefined, fillAlpha: 0.3 })
          }
        />
        Fill
      </label>
    </div>
  );
}

/** GM: which floor of the scene to see and edit; players see their own token's. */
function LevelPicker({ session }: Readonly<{ session: Session }>) {
  const levels = session.world?.levels ?? [];
  if (!levels.length) return null;
  return (
    <SelectField
      value={session.viewLevel ?? ''}
      aria-label="Level"
      title="The floor shown: walls, lights, tiles and drawings on others are left out"
      onValueChange={(id) => session.setViewLevel(id || undefined)}
      options={[{ value: '', label: 'Every level' }, ...levels.map((l) => ({ value: l.id, label: l.name }))]}
    />
  );
}
