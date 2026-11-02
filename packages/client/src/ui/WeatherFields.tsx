import type { Patch } from '@vtt/core';
import { type Weather, WeatherSchema } from '@vtt/shared';
import { XIcon } from 'lucide-react';
import {
  addWeather,
  CYCLE_CHOICES,
  cycleWeathers,
  removeWeather,
  setWeather,
  toggleCycleWeather,
  WEATHER_PRESETS,
} from '../editor/weather-edit.ts';
import { Button } from './kit/button.tsx';
import { NumberField } from './kit/number-field.tsx';
import { SelectField } from './kit/select.tsx';
import { Slider } from './kit/slider.tsx';
import { ToggleGroup, ToggleGroupItem } from './kit/toggle-group.tsx';

// GM: a scene's weather in its settings: a preset to add (rain, a storm...)
// and each layer's thickness and wind, or a cross to take it away; or the
// weathers it turns between as world time passes, and how often.

const layersOf = (value: unknown): Weather[] =>
  Array.isArray(value) ? value.flatMap((w) => WeatherSchema.safeParse(w).data ?? []) : [];

type Edit = (patch: Patch) => void;

export function WeatherFields({ value, cycle, edit }: Readonly<{ value: unknown; cycle: unknown; edit: Edit }>) {
  if (cycleWeathers(cycle).length) return <CycleFields cycle={cycle} edit={edit} />;
  return (
    <>
      <LayerFields value={value} edit={edit} />
      <CycleFields cycle={cycle} edit={edit} />
    </>
  );
}

/** The weathers the scene turns between as the clock runs, each for `every` hours. */
function CycleFields({ cycle, edit }: Readonly<{ cycle: unknown; edit: Edit }>) {
  const picked = cycleWeathers(cycle);
  const every = (cycle as { every?: number } | undefined)?.every ?? 4;
  const toggle = (next: string[]) => {
    const changed = [...next.filter((w) => !picked.includes(w)), ...picked.filter((w) => !next.includes(w))][0];
    if (changed) edit({ weatherCycle: toggleCycleWeather(cycle, changed) });
  };
  return (
    <div className="flex flex-col gap-1.5" title="The weather turns between these as world time passes">
      <span>Weather changes with time</span>
      <ToggleGroup type="multiple" className="flex-wrap justify-start" value={picked} onValueChange={toggle}>
        {CYCLE_CHOICES.map((c) => (
          <ToggleGroupItem key={c.value} value={c.value}>
            {c.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {picked.length > 0 && (
        <label className="flex items-center gap-2 text-xs">
          <span>Every (hours)</span>
          <NumberField
            aria-label="Hours each weather lasts"
            value={every}
            min={1}
            max={72}
            onValueChange={(n) => edit({ weatherCycle: { ...(cycle as object), every: n } })}
          />
        </label>
      )}
    </div>
  );
}

function LayerFields({ value, edit }: Readonly<{ value: unknown; edit: Edit }>) {
  const layers = layersOf(value);
  return (
    <div className="flex flex-col gap-1.5">
      <span>Weather</span>
      {layers.map((w, i) => (
        <Layer
          key={`${w.kind}-${i}`}
          weather={w}
          onChange={(patch) => edit({ weather: setWeather(layers, i, patch) })}
          onRemove={() => edit({ weather: removeWeather(layers, i) })}
        />
      ))}
      <SelectField
        value=""
        aria-label="Add weather"
        placeholder="Add weather…"
        className="h-8 text-xs"
        onValueChange={(preset) => edit({ weather: addWeather(layers, preset) })}
        options={WEATHER_PRESETS.map((p) => ({ value: p.id, label: p.label }))}
      />
    </div>
  );
}

interface LayerProps {
  weather: Weather;
  onChange: (patch: Partial<Weather>) => void;
  onRemove: () => void;
}

function Layer({ weather, onChange, onRemove }: Readonly<LayerProps>) {
  return (
    <div className="flex items-center gap-2 text-xs" aria-label={`${weather.kind} weather`}>
      <span className="w-14 capitalize">{weather.kind}</span>
      <Slider
        className="w-20"
        aria-label="Thickness"
        title="Thickness"
        min={0}
        max={1}
        step={0.05}
        defaultValue={[weather.density]}
        onValueCommit={([n]) => onChange({ density: n! })}
      />
      <Slider
        className="w-20"
        aria-label="Wind"
        title="Wind (left to right)"
        min={-1}
        max={1}
        step={0.1}
        defaultValue={[weather.wind ?? 0]}
        onValueCommit={([n]) => onChange({ wind: n! })}
      />
      <Button variant="ghost" size="icon-sm" aria-label="Remove" onClick={onRemove}>
        <XIcon />
      </Button>
    </div>
  );
}
