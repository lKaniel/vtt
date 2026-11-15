import type { Doc } from '@vtt/core';
import { canBePart, type ScenePart } from '@vtt/shared';
import { PencilIcon, Trash2Icon } from 'lucide-react';
import { t } from '../i18n/index.ts';
import type { Session } from '../session/session.ts';
import { Button } from './kit/button.tsx';
import { Input } from './kit/input.tsx';
import { SelectField } from './kit/select.tsx';

// The parts of a combined scene, in its settings (shared/scene-parts.ts):
// other scenes laid on this one, each at its own place, played as one map.
// A part is edited as the scene it is: Edit goes there.

const partsOf = (doc: Doc) => (Array.isArray(doc.parts) ? (doc.parts as ScenePart[]) : []);
const nameOf = (doc: Doc | undefined, id: string) => (typeof doc?.name === 'string' ? doc.name : id);
const gridOf = (doc: Doc) => (typeof doc.gridSize === 'number' ? doc.gridSize : 100);

export function SceneParts({ session, doc }: Readonly<{ session: Session; doc: Doc }>) {
  const parts = partsOf(doc);
  const scenes = session.scenes.list();
  const known = new Map(scenes.map((d) => [d.id, { gridSize: gridOf(d), parts: partsOf(d) }]));
  const free = scenes.filter((d) => canBePart(doc.id, d.id, known));
  const save = (next: ScenePart[]) => session.scenes.edit(doc.id, { parts: next.length ? next : null });
  const move = (scene: string, patch: Partial<ScenePart>) =>
    save(parts.map((p) => (p.scene === scene ? { ...p, ...patch } : p)));
  return (
    <section className="flex flex-col gap-2" aria-label={t('parts.title')}>
      <p className="muted text-xs">{t(parts.length ? 'parts.hint' : 'parts.none')}</p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {parts.map((part) => (
          <PartRow
            key={part.scene}
            name={nameOf(session.docs.get('scenes', part.scene), part.scene)}
            part={part}
            grid={gridOf(doc)}
            onMove={(patch) => move(part.scene, patch)}
            onEdit={() => session.scenes.view(part.scene)}
            onRemove={() => save(parts.filter((p) => p.scene !== part.scene))}
          />
        ))}
      </ul>
      <SelectField
        className="self-start"
        aria-label={t('parts.add')}
        placeholder={t(free.length ? 'parts.add' : 'parts.noneFree')}
        disabled={!free.length}
        value=""
        onValueChange={(scene) => scene && save([...parts, { scene, x: 0, y: 0 }])}
        options={free.map((d) => ({ value: d.id, label: nameOf(d, d.id) }))}
      />
    </section>
  );
}

interface RowProps {
  name: string;
  part: ScenePart;
  /** The scene's square, in pixels: parts are placed in squares. */
  grid: number;
  onMove: (patch: Partial<ScenePart>) => void;
  onEdit: () => void;
  onRemove: () => void;
}

function PartRow({ name, part, grid, onMove, onEdit, onRemove }: Readonly<RowProps>) {
  return (
    <li className="flex items-center gap-1.5 rounded-md border border-gold-dim/40 p-2" aria-label={name}>
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <Squares label={t('parts.across')} value={part.x / grid} onDone={(n) => onMove({ x: n * grid })} />
      <Squares label={t('parts.down')} value={part.y / grid} onDone={(n) => onMove({ y: n * grid })} />
      <Button variant="outline" size="sm" title={t('parts.editHint')} onClick={onEdit}>
        <PencilIcon />
        {t('parts.edit')}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t('parts.remove')}
        title={t('parts.removeHint')}
        onClick={onRemove}
      >
        <Trash2Icon />
      </Button>
    </li>
  );
}

/** Squares from the scene's corner, saved when you leave the box. */
function Squares({ label, value, onDone }: Readonly<{ label: string; value: number; onDone: (n: number) => void }>) {
  return (
    <Input
      key={value}
      type="number"
      className="w-20"
      aria-label={label}
      title={label}
      defaultValue={value}
      onBlur={(e) => {
        const n = Number(e.target.value.trim());
        if (e.target.value.trim() !== '' && Number.isFinite(n) && n !== value) onDone(n);
      }}
    />
  );
}
