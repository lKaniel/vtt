import type { EditorMode, ItemMode, TileTexture } from '@vtt/shared';
import { ITEM_TOOLS, type ItemTool } from '../editor/shape-tools.ts';
import {
  BrickWallIcon,
  CloudFogIcon,
  LayoutGridIcon,
  LightbulbIcon,
  MousePointer2Icon,
  PencilIcon,
  RulerIcon,
  SquareDashedIcon,
  StickyNoteIcon,
  Volume2Icon,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { LIGHT_PRESETS, TILE_PRESETS, type LightPreset } from '../play/map-tools.ts';
import type { Session } from '../session/session.ts';
import { EVERY_LEVEL } from '../session/session-levels.ts';
import { t } from '../i18n/index.ts';
import type { EditorTool } from '../session/session-editor.ts';
import { LayersPanel } from './LayersPanel.tsx';
import { StampTools } from './StampTools.tsx';
import { Button } from './kit/button.tsx';
import { Toggle } from './kit/toggle.tsx';
import { SelectField } from './kit/select.tsx';
import { Slider } from './kit/slider.tsx';
import { ColorInput } from './kit/color-input.tsx';
import { Checkbox } from './kit/checkbox.tsx';

const modeList = (): { mode: EditorMode; label: string; key: string; hint: string; icon: LucideIcon }[] => [
  {
    mode: 'tokens',
    label: t('mapTools.label.tokens'),
    key: 'T',
    hint: t('mapTools.hint.selectMoveAndAct'),
    icon: MousePointer2Icon,
  },
  {
    mode: 'tiles',
    label: t('mapTools.label.tiles'),
    key: 'Shift+T',
    hint: t('mapTools.hint.drawSelectMoveResize'),
    icon: LayoutGridIcon,
  },
  {
    mode: 'walls',
    label: t('mapTools.label.walls'),
    key: 'W',
    hint: t('mapTools.hint.selectMoveAndReshape'),
    icon: BrickWallIcon,
  },
  {
    mode: 'lights',
    label: t('mapTools.label.lights'),
    key: 'L',
    hint: t('mapTools.hint.selectMoveAndResize'),
    icon: LightbulbIcon,
  },
  {
    mode: 'drawings',
    label: t('mapTools.label.draw'),
    key: 'D',
    hint: t('mapTools.hint.shapesLinesFreehandAnd'),
    icon: PencilIcon,
  },
  {
    mode: 'notes',
    label: t('mapTools.label.notes'),
    key: 'N',
    hint: t('mapTools.hint.pinsThatOpenJournal'),
    icon: StickyNoteIcon,
  },
  {
    mode: 'templates',
    label: t('mapTools.label.measure'),
    key: 'M',
    hint: t('mapTools.hint.theRulerRAnd'),
    icon: RulerIcon,
  },
  {
    mode: 'regions',
    label: t('mapTools.label.regions'),
    key: '',
    hint: t('mapTools.hint.areasThatDoSomething'),
    icon: SquareDashedIcon,
  },
  {
    mode: 'sounds',
    label: t('mapTools.label.sounds'),
    key: '',
    hint: t('mapTools.hint.ambientSoundLouderThe'),
    icon: Volume2Icon,
  },
];

const itemToolInfo = (): Record<ItemTool, { label: string; hint: string }> => ({
  rect: { label: t('mapTools.label.box'), hint: t('mapTools.hint.dragABoxShift') },
  ellipse: { label: t('mapTools.label.ellipse'), hint: t('mapTools.hint.dragTheBoxIt') },
  polygon: { label: t('mapTools.label.polygon'), hint: t('mapTools.hint.clickCornerToCorner') },
  line: { label: t('mapTools.label.line'), hint: t('mapTools.hint.clickPointToPoint') },
  freehand: { label: t('mapTools.label.freehand'), hint: t('mapTools.hint.dragToDraw') },
  text: { label: t('mapTools.label.text'), hint: t('mapTools.hint.dragTheBoxThe') },
  note: { label: t('mapTools.label.pin'), hint: t('mapTools.hint.clickToPutA') },
  sound: { label: t('mapTools.label.place'), hint: t('mapTools.hint.clickToPlaceA') },
  circle: { label: t('mapTools.label.circle'), hint: t('mapTools.hint.dragOutFromThe') },
  cone: { label: t('mapTools.label.cone'), hint: t('mapTools.hint.dragOutFromThe2') },
  ray: { label: t('mapTools.label.line'), hint: t('mapTools.hint.dragOutFromThe22') },
  square: { label: t('mapTools.label.square'), hint: t('mapTools.hint.dragOutFromThe222') },
  region: { label: t('mapTools.label.region'), hint: t('mapTools.hint.clickCornerToCorner') },
});

const itemTools = (mode: ItemMode) => [
  select(),
  ...ITEM_TOOLS[mode].map((tool) => ({ tool, ...itemToolInfo()[tool] })),
];

const select = () => ({
  tool: 'select' as const,
  label: t('mapTools.label.select'),
  hint: t('mapTools.hint.clickOrDragA'),
});

/** The tools of each mode, after Select. */
const toolList = (): Partial<Record<EditorMode, { tool: EditorTool; label: string; hint: string }[]>> => ({
  tiles: [
    select(),
    {
      tool: 'tile',
      label: t('mapTools.label.draw'),
      hint: t('mapTools.hint.dragABoxTo'),
    },
    { tool: 'stamp', label: t('stamp.title'), hint: t('stamp.hint') },
  ],
  walls: [
    select(),
    { tool: 'wall', label: t('mapTools.label.wall'), hint: t('mapTools.hint.clickCornerToCorner2') },
    { tool: 'door', label: t('mapTools.label.door'), hint: t('mapTools.hint.clickBothEndsOf') },
    { tool: 'window', label: t('mapTools.label.window'), hint: t('mapTools.hint.likeWallsButThey') },
  ],
  lights: [select(), { tool: 'place', label: t('mapTools.label.place'), hint: t('mapTools.hint.clickToPlaceThe') }],
  drawings: itemTools('drawings'),
  notes: itemTools('notes'),
  templates: [
    select(),
    {
      tool: 'ruler',
      label: t('mapTools.label.ruler'),
      hint: t('mapTools.hint.clickToStartOn'),
    },
    ...itemTools('templates').slice(1),
  ],
  regions: itemTools('regions'),
  sounds: itemTools('sounds'),
});

/** The editor modes in a rail up the left edge (players: tokens, drawings and templates), each mode's tools beside it, and the GM's map settings. */
export function MapTools({ session }: Readonly<{ session: Session }>) {
  const gm = session.isGm();
  const [sceneTools, setSceneTools] = useState(loadSceneTools);
  const modes = modeList().filter((m) => session.editor.canUseMode(m.mode));
  return (
    <div className="map-tools">
      <div
        className="map-tools-rail frame"
        role="toolbar"
        aria-label={t('mapTools.editorMode')}
        aria-orientation="vertical"
      >
        {modes.map(({ mode, label, key, hint, icon: Icon }) => (
          <Toggle
            key={mode}
            pressed={session.editor.mode === mode}
            title={key ? `${label}: ${hint} (${key})` : `${label}: ${hint}`}
            aria-label={label}
            className="w-7 px-0 [&_svg]:size-4"
            onPressedChange={() => session.editor.setMode(mode)}
          >
            <Icon />
          </Toggle>
        ))}
        {gm && (
          <Toggle
            pressed={sceneTools}
            title={t('mapTools.sceneToolsHint')}
            aria-label={t('mapTools.sceneTools')}
            className="mt-1 w-7 px-0 [&_svg]:size-4"
            onPressedChange={(on) => {
              setSceneTools(on);
              saveSceneTools(on);
              if (!on) session.fog.setBrush(undefined);
            }}
          >
            <CloudFogIcon />
          </Toggle>
        )}
      </div>
      <ModeTools session={session} sceneTools={gm && sceneTools} />
    </div>
  );
}

/** Beside the rail: the mode's tools and settings, and the GM's floor, fog and daylight. */
function ModeTools({ session, sceneTools }: Readonly<{ session: Session; sceneTools: boolean }>) {
  const gm = session.isGm();
  const tools = toolList()[session.editor.mode];
  return (
    <div className="map-tools-more frame">
      {tools && (
        <div className="map-tools-row" role="toolbar" aria-label={t('mapTools.tool')}>
          {tools.map(({ tool, label, hint }) => (
            <Toggle
              key={tool}
              pressed={session.editor.tool === tool}
              title={hint}
              onPressedChange={() => session.editor.setTool(tool)}
            >
              {label}
            </Toggle>
          ))}
        </div>
      )}
      {session.editor.mode === 'lights' && <LightPresets session={session} />}
      {session.editor.mode === 'tiles' && session.editor.tool === 'stamp' && <StampTools session={session} />}
      {session.editor.mode === 'tiles' && session.editor.tool !== 'stamp' && <TilePresets session={session} />}
      {session.editor.mode === 'tiles' && <LayersPanel session={session} />}
      {session.editor.mode === 'drawings' && <DrawStyle session={session} />}
      {gm && <LevelPicker session={session} />}
      {sceneTools && <SceneTools session={session} />}
    </div>
  );
}

const SCENE_TOOLS_KEY = 'vtt.sceneTools';

/** Whether the GM keeps the fog and daylight tools open, kept in this browser (folded unless opened). */
function loadSceneTools(): boolean {
  try {
    return localStorage.getItem(SCENE_TOOLS_KEY) === 'open';
  } catch {
    return false;
  }
}

function saveSceneTools(open: boolean): void {
  try {
    localStorage.setItem(SCENE_TOOLS_KEY, open ? 'open' : 'folded');
  } catch {
    // Private windows may refuse storage; the choice lasts until reload.
  }
}

const brushes = () => [
  { brush: 'reveal' as const, label: t('mapTools.label.reveal'), hint: t('mapTools.hint.dragToShowThe') },
  { brush: 'hide' as const, label: t('mapTools.label.hide'), hint: t('mapTools.hint.dragToHideExplored') },
];

/**
 * The fog of war on this scene: brushes that paint explored ground in or
 * out (each stroke one undo), whose fog they paint, and a reset. While a
 * brush is on, the map shows what the players picked have explored.
 */
function FogTools({ session }: Readonly<{ session: Session }>) {
  const seats = session.players.filter((p) => p.role !== 'gm');
  const picked = session.fog.players?.[0] ?? '';
  return (
    <div className="map-tools-row fog-tools" role="toolbar" aria-label={t('mapTools.fogOfWar')}>
      <span className="fog-label">{t('mapTools.fog')}</span>
      {brushes().map(({ brush, label, hint }) => (
        <Toggle
          key={brush}
          pressed={session.fog.brush === brush}
          title={hint}
          onPressedChange={(on) => session.fog.setBrush(on ? brush : undefined)}
        >
          {label}
        </Toggle>
      ))}
      <Slider
        className="w-20"
        min={1}
        max={10}
        value={[session.fog.brushSize]}
        title={`Brush: ${session.fog.brushSize} squares across each way`}
        aria-label={t('mapTools.brushSize')}
        onValueChange={([n]) => session.fog.setBrushSize(n!)}
      />
      <SelectField
        value={picked}
        aria-label={t('mapTools.whoseFog')}
        title={t('mapTools.whoseFogTheBrushes')}
        onValueChange={(id) => session.fog.setPlayers(id ? [id] : undefined)}
        options={[
          { value: '', label: t('mapTools.allPlayers') },
          ...seats.map((p) => ({ value: p.id, label: p.name })),
        ]}
      />
      <Button
        variant="outline"
        size="sm"
        title={t('mapTools.forgetWhatTheyExplored')}
        onClick={() => session.fog.reset()}
      >
        Reset
      </Button>
    </div>
  );
}

function LightPresets({ session }: Readonly<{ session: Session }>) {
  return (
    <SelectField
      value={session.editor.lightPreset}
      onValueChange={(id) => session.editor.setLightPreset(id as LightPreset)}
      title={t('mapTools.theLightThePlace')}
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
  if (clock) return <span className="muted map-tools-darkness">{t('mapTools.darknessFollowsTheClock')}</span>;
  return (
    <label className="map-tools-darkness" title={t('mapTools.timeOfDayHow')}>
      <span>Day</span>
      <Slider
        className="w-32"
        aria-label={t('mapTools.darkness')}
        min={0}
        max={1}
        step={0.05}
        value={[value]}
        onValueChange={([n]) => setValue(n!)}
        onValueCommit={([n]) => session.requests.setDarkness(n!)}
      />
      <span>Night</span>
    </label>
  );
}

function TilePresets({ session }: Readonly<{ session: Session }>) {
  return (
    <SelectField
      value={session.tiles.preset}
      onValueChange={(id) => session.tiles.setPreset(id as TileTexture)}
      title={t('mapTools.whatTheDrawTool')}
      options={Object.entries(TILE_PRESETS).map(([id, preset]) => ({
        value: id,
        label: preset.background ? `${preset.label} ${t('mapTools.ground')}` : preset.label,
      }))}
    />
  );
}

/** GM: fog of war and the time of day, folded behind the cloud button. */
function SceneTools({ session }: Readonly<{ session: Session }>) {
  return (
    <>
      {session.world?.vision !== false && <FogTools session={session} />}
      <Darkness key={session.world?.darkness ?? 0} session={session} />
    </>
  );
}

const WIDTHS = [2, 4, 8, 16];

/** How new drawings look: line colour and width, and a fill. */
function DrawStyle({ session }: Readonly<{ session: Session }>) {
  const style = session.draw.style;
  return (
    <div className="map-tools-row" role="toolbar" aria-label={t('mapTools.drawingStyle')}>
      <ColorInput
        value={style.stroke}
        title={t('mapTools.lineColour')}
        aria-label={t('mapTools.lineColour')}
        onChange={(e) => session.draw.setStyle({ stroke: e.target.value })}
      />
      <SelectField
        value={String(style.strokeWidth)}
        title={t('mapTools.lineWidth')}
        aria-label={t('mapTools.lineWidth')}
        onValueChange={(w) => session.draw.setStyle({ strokeWidth: Number(w) })}
        options={WIDTHS.map((w) => ({ value: String(w), label: `${w} px` }))}
      />
      <label className="map-tools-check" title={t('mapTools.fillBoxesEllipsesAnd')}>
        <Checkbox
          checked={!!style.fill}
          onCheckedChange={(on) =>
            session.draw.setStyle({ fill: on === true ? style.stroke : undefined, fillAlpha: 0.3 })
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
      value={session.levels.view ?? ''}
      aria-label={t('levels.picker')}
      title={t('levels.pickerHint')}
      onValueChange={(id) => session.levels.setView(id || undefined)}
      options={[
        { value: '', label: t('levels.follow') },
        { value: EVERY_LEVEL, label: t('levels.every') },
        ...levels.map((l) => ({ value: l.id, label: l.name })),
      ]}
    />
  );
}
