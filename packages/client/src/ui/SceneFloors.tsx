import type { Doc } from '@vtt/core';
import type { SceneLevel } from '@vtt/shared';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { t } from '../i18n/index.ts';
import type { Session } from '../session/session.ts';
import { Button } from './kit/button.tsx';
import { Input } from './kit/input.tsx';
import { Toggle } from './kit/toggle.tsx';

// The floors of a scene, in its settings (see "Scene levels" in
// docs/game-format.md): add one on top, rename it, move its heights, say
// which floors it looks down on, or take it away. The map tools' level
// picker then shows one floor, and what is drawn goes on it.

const levelsOf = (doc: Doc) => (Array.isArray(doc.levels) ? (doc.levels as SceneLevel[]) : []);

export function SceneFloors({ session, doc }: Readonly<{ session: Session; doc: Doc }>) {
  const levels = levelsOf(doc);
  const sorted = [...levels].sort((a, b) => b.bottom - a.bottom);
  return (
    <section className="flex flex-col gap-2" aria-label={t('floors.title')}>
      <p className="muted text-xs">{t(levels.length ? 'floors.hint' : 'floors.none')}</p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {sorted.map((level) => (
          <FloorRow key={level.id} session={session} scene={doc.id} level={level} levels={levels} />
        ))}
      </ul>
      <Button variant="outline" size="sm" className="self-start" onClick={() => session.scenes.addLevel(doc.id)}>
        <PlusIcon />
        {t(levels.length ? 'floors.add' : 'floors.addFirst')}
      </Button>
    </section>
  );
}

interface RowProps {
  session: Session;
  scene: string;
  level: SceneLevel;
  levels: SceneLevel[];
}

function FloorRow({ session, scene, level, levels }: Readonly<RowProps>) {
  const edit = (patch: Partial<Omit<SceneLevel, 'id'>>) => session.scenes.editLevel(scene, level.id, patch);
  const others = levels.filter((l) => l.id !== level.id).sort((a, b) => a.bottom - b.bottom);
  const sees = new Set(level.sees ?? []);
  return (
    <li className="flex flex-col gap-1 rounded-md border border-gold-dim/40 p-2" aria-label={level.name}>
      <div className="flex items-center gap-1.5">
        <Input
          key={level.name}
          className="min-w-0 flex-1"
          aria-label={t('floors.name')}
          defaultValue={level.name}
          onBlur={(e) => e.target.value.trim() !== level.name && edit({ name: e.target.value })}
        />
        <Feet label={t('floors.bottom')} value={level.bottom} onDone={(n) => n !== undefined && edit({ bottom: n })} />
        <span className="muted">–</span>
        <Feet label={t('floors.top')} value={level.top} onDone={(n) => edit({ top: n })} />
        <span className="muted text-xs">ft</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('floors.remove', { name: level.name })}
          title={t('floors.removeHint')}
          onClick={() => session.scenes.removeLevel(scene, level.id)}
        >
          <Trash2Icon />
        </Button>
      </div>
      {others.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <span className="muted">{t('floors.sees')}</span>
          {others.map((o) => (
            <Toggle
              key={o.id}
              className="h-6 px-2 text-xs"
              pressed={sees.has(o.id)}
              onPressedChange={(on) => edit({ sees: on ? [...sees, o.id] : [...sees].filter((id) => id !== o.id) })}
            >
              {o.name}
            </Toggle>
          ))}
        </div>
      )}
    </li>
  );
}

/** Feet, saved when you leave the box; empty is none (a ceiling at the next floor). */
function Feet({
  label,
  value,
  onDone,
}: Readonly<{ label: string; value: number | undefined; onDone: (n: number | undefined) => void }>) {
  return (
    <Input
      key={value ?? ''}
      type="number"
      className="w-16"
      aria-label={label}
      title={label}
      defaultValue={value ?? ''}
      onBlur={(e) => {
        const text = e.target.value.trim();
        const n = text === '' ? undefined : Number(text);
        if (n !== value && (n === undefined || Number.isFinite(n))) onDone(n);
      }}
    />
  );
}
