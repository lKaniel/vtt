import type { Patch } from '@vtt/core';
import { type Weather, WeatherSchema } from '@vtt/shared';
import { XIcon } from 'lucide-react';
import { addWeather, removeWeather, setWeather, WEATHER_PRESETS } from '../editor/weather-edit.ts';
import { Button } from './kit/button.tsx';
import { SelectField } from './kit/select.tsx';
import { Slider } from './kit/slider.tsx';

// GM: a scene's weather in its settings: a preset to add (rain, a storm...)
// and each layer's thickness and wind, or a cross to take it away.

const layersOf = (value: unknown): Weather[] =>
  Array.isArray(value) ? value.flatMap((w) => WeatherSchema.safeParse(w).data ?? []) : [];

export function WeatherFields({ value, edit }: Readonly<{ value: unknown; edit: (patch: Patch) => void }>) {
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
